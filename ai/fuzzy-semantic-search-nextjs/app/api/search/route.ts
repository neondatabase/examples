export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { normalize } from '@/lib/normalize'
import { generateEmbedding } from '@/lib/embeddings'

export interface SearchResult {
  show_id: string
  title: string
  title_normalized?: string // For explain mode
  type: string
  director: string | null
  cast_members: string | null
  country: string | null
  release_year: number | null
  rating: string | null
  duration: string | null
  listed_in: string | null
  description: string | null
  score: number
}

export interface HybridResult extends SearchResult {
  rrfScore: number
  sources: ('fuzzy' | 'semantic')[]
  fuzzyRank?: number
  semanticRank?: number
}

export interface ScoreDistribution {
  bucket: string // e.g., "0-10", "10-20"
  count: number
  min: number // bucket min value (0-1)
  max: number // bucket max value (0-1)
}

export interface SearchResponse {
  fuzzy: {
    results: SearchResult[]
    timeMs: number
    query: string
    distribution?: ScoreDistribution[]
    totalMatches?: number
  }
  semantic: {
    results: SearchResult[]
    timeMs: number
    error?: string
    distribution?: ScoreDistribution[]
    totalMatches?: number
    embeddingsAvailable?: boolean // false = no embeddings generated yet
  }
  hybrid: {
    results: HybridResult[]
  }
  recommended: 'fuzzy' | 'semantic' | null
}

const DEFAULT_FUZZY_THRESHOLD = 0.2
const FUZZY_GOOD_THRESHOLD = 0.5 // If fuzzy score >= this, recommend fuzzy
const DEFAULT_SEMANTIC_THRESHOLD = 0.4
const RRF_K = 60 // RRF constant (standard value)

/**
 * Bucket scores into 10% ranges for distribution chart
 */
function computeDistribution(scores: number[]): ScoreDistribution[] {
  const buckets: ScoreDistribution[] = []
  
  for (let i = 0; i < 10; i++) {
    const min = i / 10
    const max = (i + 1) / 10
    const label = `${i * 10}-${(i + 1) * 10}`
    
    const count = scores.filter(s => s >= min && s < max).length
    buckets.push({ bucket: label, count, min, max })
  }
  
  // Handle scores of exactly 1.0
  const perfectScores = scores.filter(s => s >= 1.0).length
  if (perfectScores > 0) {
    buckets[9].count += perfectScores
  }
  
  return buckets
}

/**
 * Reciprocal Rank Fusion (RRF) - merges results from multiple ranked lists
 * Formula: score = Σ 1/(k + rank) for each list the result appears in
 */
function computeRRF(
  fuzzyResults: SearchResult[],
  semanticResults: SearchResult[]
): HybridResult[] {
  const resultMap = new Map<string, HybridResult>()

  // Process fuzzy results
  fuzzyResults.forEach((result, index) => {
    const rank = index + 1
    const rrfScore = 1 / (RRF_K + rank)
    
    resultMap.set(result.show_id, {
      ...result,
      rrfScore,
      sources: ['fuzzy'],
      fuzzyRank: rank,
    })
  })

  // Process semantic results
  semanticResults.forEach((result, index) => {
    const rank = index + 1
    const rrfScore = 1 / (RRF_K + rank)
    
    const existing = resultMap.get(result.show_id)
    if (existing) {
      // Result appears in both - add scores
      existing.rrfScore += rrfScore
      existing.sources.push('semantic')
      existing.semanticRank = rank
    } else {
      resultMap.set(result.show_id, {
        ...result,
        rrfScore,
        sources: ['semantic'],
        semanticRank: rank,
      })
    }
  })

  // Sort by RRF score descending and return top 10
  return Array.from(resultMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, 10)
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')
  const includeDistribution = searchParams.get('distribution') === 'true'
  
  // Parse threshold parameters (0-100 from UI, convert to 0-1)
  const fuzzyThresholdParam = searchParams.get('fuzzyThreshold')
  const semanticThresholdParam = searchParams.get('semanticThreshold')
  
  const fuzzyThreshold = fuzzyThresholdParam 
    ? Math.max(0, Math.min(1, Number(fuzzyThresholdParam) / 100))
    : DEFAULT_FUZZY_THRESHOLD
  const semanticThreshold = semanticThresholdParam
    ? Math.max(0, Math.min(1, Number(semanticThresholdParam) / 100))
    : DEFAULT_SEMANTIC_THRESHOLD

  if (!query || query.trim().length === 0) {
    return NextResponse.json({
      fuzzy: { results: [], timeMs: 0, query: '' },
      semantic: { results: [], timeMs: 0 },
      hybrid: { results: [] },
      recommended: null,
    } satisfies SearchResponse)
  }

  const sql = getDb()
  const normalizedQuery = normalize(query)
  const lowerQuery = query.toLowerCase().trim()

  // Run both searches and track timing
  const response: SearchResponse = {
    fuzzy: { results: [], timeMs: 0, query: normalizedQuery },
    semantic: { results: [], timeMs: 0 },
    hybrid: { results: [] },
    recommended: null,
  }

  try {
    // Generate embedding for query
    let queryEmbedding: number[] | null = null
    try {
      queryEmbedding = await generateEmbedding(query)
    } catch (err) {
      console.error('Semantic search error:', err)
      response.semantic.error = 'Embedding generation failed'
    }

    const embeddingStr = queryEmbedding ? `[${queryEmbedding.join(',')}]` : null

    // Fuzzy search (using combined search_text column: title + director + cast)
    // Uses <% operator for index scan, then filters by threshold
    const fuzzyStart = performance.now()
    const fuzzyResults = await sql`
      SELECT * FROM (
        SELECT 
          show_id,
          title,
          title_normalized,
          type,
          director,
          cast_members,
          country,
          release_year,
          rating,
          duration,
          listed_in,
          description,
          word_similarity(${lowerQuery}, search_text) AS score
        FROM netflix_shows
        WHERE ${lowerQuery} <% search_text
           OR search_text % ${lowerQuery}
      ) scored
      WHERE score >= ${fuzzyThreshold}
      ORDER BY score DESC
      LIMIT 10
    `
    response.fuzzy.timeMs = Math.round(performance.now() - fuzzyStart)
    response.fuzzy.results = fuzzyResults as SearchResult[]

    // Semantic search - uses subquery to enable IVFFlat index usage
    // The index only works with ORDER BY embedding <=> vector, not with computed expressions in WHERE
    if (embeddingStr) {
      const semanticStart = performance.now()
      const semanticResults = await sql`
        SELECT * FROM (
          SELECT 
            show_id,
            title,
            type,
            director,
            cast_members,
            country,
            release_year,
            rating,
            duration,
            listed_in,
            description,
            1 - (embedding <=> ${embeddingStr}::vector) AS score
          FROM netflix_shows
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> ${embeddingStr}::vector
          LIMIT 50
        ) candidates
        WHERE score > ${semanticThreshold}
        LIMIT 10
      `
      response.semantic.timeMs = Math.round(performance.now() - semanticStart)
      response.semantic.results = semanticResults as SearchResult[]

      // Lazy check: only verify embeddings exist when semantic returns 0 results
      if (semanticResults.length === 0) {
        const check = await sql`
          SELECT EXISTS(SELECT 1 FROM netflix_shows WHERE embedding IS NOT NULL LIMIT 1) as has_embeddings
        `
        response.semantic.embeddingsAvailable = Boolean(check[0].has_embeddings)
      } else {
        // Got results, so embeddings definitely exist
        response.semantic.embeddingsAvailable = true
      }
    } else {
      response.semantic.timeMs = 0
      response.semantic.error = 'Embedding generation failed'
    }

    // Get score distributions if requested (run in parallel for better performance)
    if (includeDistribution) {
      const distributionQueries = [
        sql`
          SELECT word_similarity(${lowerQuery}, search_text) AS score
          FROM netflix_shows
          WHERE ${lowerQuery} <% search_text
             OR search_text % ${lowerQuery}
          ORDER BY score DESC
          LIMIT 500
        `,
        embeddingStr ? sql`
          SELECT score FROM (
            SELECT 1 - (embedding <=> ${embeddingStr}::vector) AS score
            FROM netflix_shows
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> ${embeddingStr}::vector
            LIMIT 500
          ) candidates
          WHERE score > 0.2
        ` : Promise.resolve([])
      ]
      
      const [fuzzyAllScores, semanticAllScores] = await Promise.all(distributionQueries)
      
      const fuzzyScores = fuzzyAllScores.map(r => Number(r.score))
      response.fuzzy.distribution = computeDistribution(fuzzyScores)
      response.fuzzy.totalMatches = fuzzyScores.filter(s => s > fuzzyThreshold).length
      
      if (embeddingStr && semanticAllScores.length > 0) {
        const semScores = semanticAllScores.map(r => Number(r.score))
        response.semantic.distribution = computeDistribution(semScores)
        response.semantic.totalMatches = semScores.filter(s => s > semanticThreshold).length
      }
    }

    // Compute hybrid results using Reciprocal Rank Fusion
    response.hybrid.results = computeRRF(
      response.fuzzy.results,
      response.semantic.results
    )

    // Determine recommended method using hybrid logic:
    // - If fuzzy has a strong match (>= 0.5), recommend fuzzy
    // - Otherwise, if semantic has results, recommend semantic
    // - Otherwise, if fuzzy has any results, recommend fuzzy
    const fuzzyTopScore = response.fuzzy.results[0]?.score ?? 0
    const hasSemanticResults = response.semantic.results.length > 0 && !response.semantic.error
    const hasFuzzyResults = response.fuzzy.results.length > 0

    if (hasFuzzyResults && Number(fuzzyTopScore) >= FUZZY_GOOD_THRESHOLD) {
      response.recommended = 'fuzzy'
    } else if (hasSemanticResults) {
      response.recommended = 'semantic'
    } else if (hasFuzzyResults) {
      response.recommended = 'fuzzy'
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { error: 'Search failed. Make sure to run `npm run setup` first.' },
      { status: 500 }
    )
  }
}
