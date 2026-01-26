/**
 * Embedding script - generate or regenerate embeddings for all shows.
 * 
 * This script is resumable: if interrupted, run again to continue where it left off.
 * 
 * Usage:
 *   npm run embed           # Generate with 'rich' strategy (default)
 *   npm run embed:minimal   # Use 'minimal' strategy (title only)
 *   npm run embed:basic     # Use 'basic' strategy (title + description)
 *   npm run embed:rich      # Use 'rich' strategy (all fields)
 *   npm run embed:reset     # Clear all embeddings
 *   npm run embed:help      # Show help
 */

import 'dotenv/config'
import { neon } from '@neondatabase/serverless'
import { runBatchEmbedding } from '../lib/batch-embedding'
import type { EmbeddingStrategy } from '../lib/embedding-strategies'

function showHelp() {
  console.log(`
Generate embeddings for semantic search.
Resumable - if interrupted, run again to continue where you left off.

Commands:
  npm run embed           Generate with 'rich' strategy (default)
  npm run embed:minimal   Title only - fastest, least context
  npm run embed:basic     Title + description - good balance
  npm run embed:rich      All fields - best quality (default)
  npm run embed:reset     Clear all embeddings
  npm run embed:help      Show this help

Strategies:
  minimal   Embeds only the title. Fast but limited semantic matching.
  basic     Embeds title + description. Good balance.
  rich      Embeds title + description + director + cast + genres + country.
            Best for queries like "Korean thriller" or "Spielberg adventure".

To change strategy, first clear then regenerate:
  npm run embed:reset && npm run embed:basic
`)
  process.exit(0)
}

// Parse arguments
function parseArgs(): { strategy: EmbeddingStrategy; force: boolean } {
  const args = process.argv.slice(2)
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp()
  }
  
  let strategy: EmbeddingStrategy = 'rich'
  if (args.includes('--minimal')) strategy = 'minimal'
  if (args.includes('--basic')) strategy = 'basic'
  if (args.includes('--rich')) strategy = 'rich'
  
  const force = args.includes('--force')
  
  return { strategy, force }
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set')
    console.error('   Run `npm run setup` first to set up the database')
    process.exit(1)
  }

  const { strategy, force } = parseArgs()
  const sql = neon(connectionString)

  console.log('🔄 Embedding Netflix shows\n')

  const result = await runBatchEmbedding(sql, { strategy, force })

  console.log('\n✅ Embedding complete!')
  console.log(`   Embedded: ${result.embedded}`)
  console.log(`   Skipped: ${result.skipped}`)
  console.log(`   Total: ${result.total}`)
  
  if (result.embedded > 0) {
    console.log('\n💡 Test queries to try:')
    if (strategy === 'rich') {
      console.log('   - "Korean thriller" (country + genre)')
      console.log('   - "Adam Sandler comedy" (cast + genre)')
      console.log('   - "Spielberg adventure" (director + genre)')
    } else {
      console.log('   - "shows about time travel" (conceptual)')
      console.log('   - "scary supernatural" (mood/theme)')
    }
  }
}

main().catch((error) => {
  console.error('\n❌ Embedding failed:', error.message)
  process.exit(1)
})
