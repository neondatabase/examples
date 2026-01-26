/**
 * Simple script to run SQL queries for debugging.
 * 
 * Usage: npx tsx scripts/query.ts "SELECT * FROM netflix_shows LIMIT 1"
 */

import 'dotenv/config'
import { neon } from '@neondatabase/serverless'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('❌ DATABASE_URL not set')
  process.exit(1)
}

const sql = neon(connectionString)

const query = process.argv[2]
if (!query) {
  console.error('Usage: npx tsx scripts/query.ts "YOUR SQL QUERY"')
  process.exit(1)
}

async function main() {
  console.log(`\n📝 Query: ${query}\n`)
  const start = performance.now()
  const result = await sql.query(query, [])
  const elapsed = performance.now() - start
  
  console.log(`⏱️  Time: ${elapsed.toFixed(2)}ms\n`)
  console.log('📊 Result:')
  console.table(result.rows || result)
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
