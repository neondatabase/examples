export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getDb, isUsingPooler } from '@/lib/db'

export interface QueryTypeStats {
  queryType: 'fuzzy' | 'semantic'
  avgTimeMs: number
  calls: number
}

export interface StatsResponse {
  stats: QueryTypeStats[]
  totalSearches: number
  pooled: boolean
  error?: string
  note?: string
}

export async function GET() {
  const sql = getDb()

  try {
    // Check if pg_stat_statements extension is available
    const extensionCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
      ) as enabled
    `

    if (!extensionCheck[0]?.enabled) {
      return NextResponse.json({
        stats: [],
        totalSearches: 0,
        pooled: isUsingPooler(),
        error: 'pg_stat_statements extension is not enabled. Run `npm run setup` to enable it.',
      } satisfies StatsResponse)
    }

    // Query pg_stat_statements for our search queries
    // Filter for queries that contain our search patterns
    // Note: semantic queries use the <=> operator for cosine distance
    const results = await sql`
      SELECT 
        CASE 
          WHEN query LIKE '%similarity(%' THEN 'fuzzy'
          WHEN query LIKE '%<=>%' AND query LIKE '%embedding%' THEN 'semantic'
        END as query_type,
        COALESCE(AVG(mean_exec_time), 0) as avg_time_ms,
        COALESCE(SUM(calls), 0)::int as calls
      FROM pg_stat_statements
      WHERE 
        (query LIKE '%similarity(%' OR (query LIKE '%<=>%' AND query LIKE '%embedding%'))
        AND query NOT LIKE '%pg_stat_statements%'
      GROUP BY 
        CASE 
          WHEN query LIKE '%similarity(%' THEN 'fuzzy'
          WHEN query LIKE '%<=>%' AND query LIKE '%embedding%' THEN 'semantic'
        END
      ORDER BY query_type
    `

    const stats: QueryTypeStats[] = results.map((row) => ({
      queryType: row.query_type as 'fuzzy' | 'semantic',
      avgTimeMs: Number(row.avg_time_ms),
      calls: Number(row.calls),
    }))
    
    // Use fuzzy calls as total searches (since both run on every search)
    const totalSearches = stats.find(s => s.queryType === 'fuzzy')?.calls ?? 
                          stats.find(s => s.queryType === 'semantic')?.calls ?? 0

    // If no stats yet, return empty with helpful message
    if (stats.length === 0) {
      return NextResponse.json({
        stats: [],
        totalSearches: 0,
        pooled: isUsingPooler(),
        note: 'No query stats yet. Run some searches first!',
      } satisfies StatsResponse)
    }

    return NextResponse.json({
      stats,
      totalSearches,
      pooled: isUsingPooler(),
      note: 'Stats reset when Neon compute suspends after inactivity.',
    } satisfies StatsResponse)
  } catch (error) {
    console.error('Stats query error:', error)
    
    // Handle permission errors gracefully
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    if (errorMessage.includes('permission denied') || errorMessage.includes('pg_stat_statements')) {
      return NextResponse.json({
        stats: [],
        totalSearches: 0,
        pooled: isUsingPooler(),
        error: 'Permission denied for pg_stat_statements. This may require superuser access.',
      } satisfies StatsResponse)
    }

    return NextResponse.json({
      stats: [],
      totalSearches: 0,
      pooled: isUsingPooler(),
      error: 'Failed to fetch query stats.',
    } satisfies StatsResponse)
  }
}
