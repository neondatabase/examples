import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see .env)')

/**
 * One Drizzle client over Neon's HTTP driver, one round trip per query, no pool
 * to manage. Every table lives in `schema` (src/lib/schema.ts), so `db.select`,
 * `db.insert`, etc. are fully typed. For pgvector distance ranking and the
 * lakebase_ann index (which the query builder can't express), drop to a raw
 * `sql` fragment and run it with `db.execute(sql\`…\`)`.
 */
export const db = drizzle(neon(process.env.DATABASE_URL), { schema })

/** pgvector wants '[a,b,c]' as its literal. */
export const toVector = (embedding: number[]) => JSON.stringify(embedding)
