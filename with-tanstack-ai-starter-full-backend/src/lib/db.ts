import { neon } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see .env.local)')

/** HTTP driver, one round trip per query, no pool to manage in a script. */
export const sql = neon(process.env.DATABASE_URL)

/** pgvector wants '[a,b,c]' as its literal. */
export const toVector = (embedding: number[]) => JSON.stringify(embedding)
