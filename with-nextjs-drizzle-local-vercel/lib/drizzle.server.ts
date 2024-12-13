import postgres from 'postgres'
import { neonConfig } from '@neondatabase/serverless'
import { drizzle as drizzle_neon, NeonDatabase } from 'drizzle-orm/neon-serverless'
import { drizzle as drizzle_local, PostgresJsDatabase } from 'drizzle-orm/postgres-js'

let db: PostgresJsDatabase | NeonDatabase

if (process.env.VERCEL_ENV) {
  if (!process.env.POSTGRES_URL) throw new Error('Connection string to Neon Postgres not found.')
  neonConfig.poolQueryViaFetch = true
  db = drizzle_neon(process.env.POSTGRES_URL)
} else {
  if (!process.env.LOCAL_POSTGRES_URL) throw new Error('Connection string to local Postgres not found.')
  const client = postgres(process.env.LOCAL_POSTGRES_URL)
  db = drizzle_local({ client })
}

export default db
