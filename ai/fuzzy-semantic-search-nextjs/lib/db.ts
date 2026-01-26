import { neon } from '@neondatabase/serverless'

// Track which connection type is being used
const isPooled = !!process.env.DATABASE_URL_POOLER
const connectionString = process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL

// Log once at startup
if (typeof window === 'undefined') {
  console.log(`🔌 Database: ${isPooled ? 'pooled connection (PgBouncer)' : 'direct connection'}`)
}

export function getDb() {
  if (!connectionString) {
    throw new Error('DATABASE_URL or DATABASE_URL_POOLER environment variable is not set')
  }
  // Connection caching is enabled by default in @neondatabase/serverless
  return neon(connectionString)
}

export function isUsingPooler(): boolean {
  return isPooled
}
