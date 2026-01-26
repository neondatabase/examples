/**
 * Shared batch embedding logic for setup and embed scripts.
 * Handles generating embeddings for all shows in the database.
 */

import type { NeonQueryFunction } from '@neondatabase/serverless'
import { buildEmbeddingText, type EmbeddingStrategy, STRATEGY_DESCRIPTIONS } from './embedding-strategies'

export interface BatchEmbeddingOptions {
  strategy: EmbeddingStrategy
  force: boolean // Clear existing embeddings first
}

export interface BatchEmbeddingResult {
  embedded: number
  skipped: number
  total: number
}

/**
 * Run batch embedding on all shows in the database.
 * 
 * - If force=true, clears all existing embeddings first
 * - Resumes from where it left off (only processes rows with NULL embedding)
 * - Recreates the IVFFlat index after completion
 */
export async function runBatchEmbedding(
  sql: NeonQueryFunction<false, false>,
  options: BatchEmbeddingOptions
): Promise<BatchEmbeddingResult> {
  const { strategy, force } = options

  console.log(`\n📊 Embedding Strategy: ${strategy}`)
  console.log(`   ${STRATEGY_DESCRIPTIONS[strategy]}`)
  console.log(`   Mode: ${force ? 'FORCE (clearing existing)' : 'RESUME (continue where left off)'}\n`)

  // Step 1: Optionally clear existing embeddings
  if (force) {
    console.log('🗑️  Clearing existing embeddings...')
    await sql`UPDATE netflix_shows SET embedding = NULL`
    console.log('   ✓ Cleared all embeddings\n')
  }

  // Step 2: Check current progress
  const progress = await sql`
    SELECT 
      COUNT(*) FILTER (WHERE embedding IS NOT NULL) as done,
      COUNT(*) as total
    FROM netflix_shows
  `
  const alreadyDone = Number(progress[0].done)
  const total = Number(progress[0].total)

  if (alreadyDone === total && !force) {
    console.log(`✅ All ${total} shows already have embeddings.`)
    console.log('   💡 Use --force to clear and regenerate.\n')
    return { embedded: 0, skipped: alreadyDone, total }
  }

  const remaining = total - alreadyDone
  console.log(`📈 Progress: ${alreadyDone}/${total} already embedded`)
  console.log(`   ${remaining} shows remaining\n`)

  // Step 3: Get shows that need embedding
  const shows = await sql`
    SELECT show_id, title, description, director, cast_members, listed_in, country
    FROM netflix_shows
    WHERE embedding IS NULL
  `

  if (shows.length === 0) {
    console.log('   Nothing to do!\n')
    return { embedded: 0, skipped: alreadyDone, total }
  }

  // Step 4: Load embedding model
  console.log('🔄 Loading embedding model (Xenova/gte-small)...')
  const { pipeline } = await import('@huggingface/transformers')
  const extractor = await pipeline('feature-extraction', 'Xenova/gte-small', {
    dtype: 'q8',
  })
  console.log('   ✓ Model loaded\n')

  // Step 5: Generate embeddings
  console.log(`🚀 Generating embeddings for ${shows.length} shows...`)
  console.log('   💡 Safe to interrupt - run again to resume\n')

  let embeddedCount = 0
  const batchSize = 10

  for (let i = 0; i < shows.length; i += batchSize) {
    const batch = shows.slice(i, i + batchSize)

    for (const show of batch) {
      const text = buildEmbeddingText(show, strategy)
      const output = await extractor(text, { pooling: 'mean', normalize: true })
      const embedding = Array.from(output.data as Float32Array)
      const embeddingStr = `[${embedding.join(',')}]`

      await sql`
        UPDATE netflix_shows SET embedding = ${embeddingStr}::vector WHERE show_id = ${show.show_id}
      `
      embeddedCount++
    }

    // Log progress every 100 or at the end
    if (embeddedCount % 100 === 0 || embeddedCount === shows.length) {
      const percent = ((embeddedCount / shows.length) * 100).toFixed(1)
      console.log(`   Progress: ${embeddedCount}/${shows.length} (${percent}%)`)
    }
  }

  console.log(`\n   ✓ Generated embeddings for ${embeddedCount} shows`)

  // Step 6: Recreate vector index
  console.log('\n🔧 Recreating vector index...')
  const totalWithEmbeddings = await sql`SELECT COUNT(*) as count FROM netflix_shows WHERE embedding IS NOT NULL`
  const count = Number(totalWithEmbeddings[0].count)

  if (count > 0) {
    // lists = sqrt(rows) is a good starting point for IVFFlat
    const lists = Math.max(10, Math.min(100, Math.floor(Math.sqrt(count))))

    await sql`DROP INDEX IF EXISTS idx_netflix_embedding`
    await sql.query(
      `CREATE INDEX idx_netflix_embedding 
       ON netflix_shows USING ivfflat (embedding vector_cosine_ops)
       WITH (lists = ${lists})`,
      []
    )
    console.log(`   ✓ Created IVFFlat index (lists=${lists})`)
  }

  return { embedded: embeddedCount, skipped: alreadyDone, total }
}
