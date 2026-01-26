/**
 * Reset embeddings - clears all embeddings from the database.
 * Run with: npm run embed:reset
 */

import 'dotenv/config'
import { neon } from '@neondatabase/serverless'

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set')
    process.exit(1)
  }

  const sql = neon(connectionString)
  
  console.log('🗑️  Clearing all embeddings...')
  await sql`UPDATE netflix_shows SET embedding = NULL`
  console.log('✓ All embeddings cleared')
  console.log('\n💡 Run `npm run embed` to generate new embeddings')
}

main().catch((error) => {
  console.error('❌ Reset failed:', error.message)
  process.exit(1)
})
