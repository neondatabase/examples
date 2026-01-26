/**
 * Setup script for the fuzzy-semantic-search example.
 * 
 * This script sets up the database infrastructure:
 * 1. Enables pg_trgm and pgvector extensions
 * 2. Creates the netflix_shows table
 * 3. Imports data from the Netflix dataset
 * 4. Creates search_text column for fuzzy matching
 * 5. Normalizes titles
 * 6. Creates GIN index for fuzzy search
 * 
 * Run with: npm run setup
 * 
 * After setup, run `npm run embed` to generate embeddings for semantic search.
 */

import 'dotenv/config'
import { neon } from '@neondatabase/serverless'
import { normalize } from '../lib/normalize'

// Check for DATABASE_URL
const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is not set')
  console.error('   Create a .env file with your Neon connection string')
  process.exit(1)
}

const sql = neon(connectionString)

const NETFLIX_DATA_URL =
  'https://raw.githubusercontent.com/neondatabase/postgres-sample-dbs/refs/heads/main/netflix.sql'

async function main() {
  console.log('🚀 Starting setup...\n')

  // Step 1: Enable extensions
  console.log('1️⃣  Enabling extensions...')
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`
  await sql`CREATE EXTENSION IF NOT EXISTS vector`
  await sql`CREATE EXTENSION IF NOT EXISTS pg_stat_statements`
  console.log('   ✓ pg_trgm, pgvector, and pg_stat_statements extensions enabled\n')

  // Step 2: Check if table exists and has data
  console.log('2️⃣  Checking for existing data...')
  const existingCount = await sql`
    SELECT COUNT(*) as count FROM information_schema.tables 
    WHERE table_name = 'netflix_shows'
  `
  
  if (Number(existingCount[0].count) > 0) {
    const rowCount = await sql`SELECT COUNT(*) as count FROM netflix_shows`
    if (Number(rowCount[0].count) > 0) {
      console.log(`   ℹ️  Table exists with ${rowCount[0].count} rows`)
    }
  }

  // Step 3: Create table if not exists
  console.log('3️⃣  Creating table structure...')
  await sql`
    CREATE TABLE IF NOT EXISTS netflix_shows (
      show_id text PRIMARY KEY,
      type text,
      title text,
      director text,
      cast_members text,
      country text,
      date_added date,
      release_year integer,
      rating text,
      duration text,
      listed_in text,
      description text,
      title_normalized text,
      search_text text,
      embedding vector(384)
    )
  `
  console.log('   ✓ Table structure ready\n')

  // Step 4: Import data if table is empty
  const currentCount = await sql`SELECT COUNT(*) as count FROM netflix_shows`
  if (Number(currentCount[0].count) === 0) {
    console.log('4️⃣  Importing Netflix data...')
    console.log(`   Fetching from: ${NETFLIX_DATA_URL}`)
    
    const response = await fetch(NETFLIX_DATA_URL)
    if (!response.ok) {
      throw new Error(`Failed to fetch Netflix data: ${response.statusText}`)
    }
    
    const sqlContent = await response.text()
    console.log('   ✓ Data fetched, parsing...')
    
    // Parse the COPY format and collect all rows
    const lines = sqlContent.split('\n')
    let inCopyBlock = false
    const rows: Array<{
      show_id: string
      type: string | null
      title: string | null
      director: string | null
      cast_members: string | null
      country: string | null
      date_added: string | null
      release_year: number | null
      rating: string | null
      duration: string | null
      listed_in: string | null
      description: string | null
    }> = []
    
    for (const line of lines) {
      if (line.startsWith('COPY public.netflix_shows')) {
        inCopyBlock = true
        continue
      }
      
      if (inCopyBlock && line === '\\.') {
        inCopyBlock = false
        continue
      }
      
      if (inCopyBlock && line.trim()) {
        const values = line.split('\t')
        if (values.length >= 12) {
          const [show_id, type, title, director, cast_members, country, date_added, release_year, rating, duration, listed_in, description] = values
          rows.push({
            show_id,
            type: type === '\\N' ? null : type,
            title: title === '\\N' ? null : title,
            director: director === '\\N' ? null : director,
            cast_members: cast_members === '\\N' ? null : cast_members,
            country: country === '\\N' ? null : country,
            date_added: date_added === '\\N' ? null : date_added,
            release_year: release_year === '\\N' ? null : parseInt(release_year),
            rating: rating === '\\N' ? null : rating,
            duration: duration === '\\N' ? null : duration,
            listed_in: listed_in === '\\N' ? null : listed_in,
            description: description === '\\N' ? null : description,
          })
        }
      }
    }
    
    console.log(`   Parsed ${rows.length} shows, inserting in batches...`)
    
    // Batch insert for much better performance
    const BATCH_SIZE = 100
    let insertCount = 0
    
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      
      // Use raw query for batch insert
      await sql.query(`
        INSERT INTO netflix_shows (show_id, type, title, director, cast_members, country, date_added, release_year, rating, duration, listed_in, description)
        VALUES ${batch.map((_, idx) => `($${idx * 12 + 1}, $${idx * 12 + 2}, $${idx * 12 + 3}, $${idx * 12 + 4}, $${idx * 12 + 5}, $${idx * 12 + 6}, $${idx * 12 + 7}, $${idx * 12 + 8}, $${idx * 12 + 9}, $${idx * 12 + 10}, $${idx * 12 + 11}, $${idx * 12 + 12})`).join(',')}
        ON CONFLICT (show_id) DO NOTHING
      `, batch.flatMap(r => [r.show_id, r.type, r.title, r.director, r.cast_members, r.country, r.date_added, r.release_year, r.rating, r.duration, r.listed_in, r.description]))
      
      insertCount += batch.length
      if (insertCount % 500 === 0 || insertCount === rows.length) {
        console.log(`   Imported ${insertCount}/${rows.length} shows...`)
      }
    }
    
    console.log(`   ✓ Imported ${insertCount} shows\n`)
  } else {
    console.log('4️⃣  Skipping import (data already exists)\n')
  }

  // Step 5: Populate search_text column for fuzzy search
  console.log('5️⃣  Populating search_text column...')
  const searchTextCount = await sql`SELECT COUNT(*) as count FROM netflix_shows WHERE search_text IS NULL`
  if (Number(searchTextCount[0].count) > 0) {
    await sql`
      UPDATE netflix_shows SET search_text = LOWER(
        COALESCE(title, '') || ' ' || 
        COALESCE(director, '') || ' ' || 
        COALESCE(cast_members, '')
      )
      WHERE search_text IS NULL
    `
    console.log('   ✓ Populated search_text for all shows\n')
  } else {
    console.log('   ℹ️  search_text already populated\n')
  }

  // Step 6: Normalize titles
  console.log('6️⃣  Normalizing titles for fuzzy matching...')
  const showsToNormalize = await sql`
    SELECT show_id, title FROM netflix_shows WHERE title_normalized IS NULL
  `
  
  if (showsToNormalize.length > 0) {
    const BATCH_SIZE = 100
    let normalizedCount = 0
    
    for (let i = 0; i < showsToNormalize.length; i += BATCH_SIZE) {
      const batch = showsToNormalize.slice(i, i + BATCH_SIZE)
      
      const cases = batch.map(show => {
        const normalized = normalize(show.title || '')
        return { show_id: show.show_id, normalized }
      })
      
      const ids = cases.map(c => c.show_id)
      const normalizedValues = cases.map(c => c.normalized)
      
      await sql.query(`
        UPDATE netflix_shows 
        SET title_normalized = data.normalized
        FROM (SELECT unnest($1::text[]) as id, unnest($2::text[]) as normalized) as data
        WHERE netflix_shows.show_id = data.id
      `, [ids, normalizedValues])
      
      normalizedCount += batch.length
      if (normalizedCount % 500 === 0 || normalizedCount === showsToNormalize.length) {
        console.log(`   Normalized ${normalizedCount}/${showsToNormalize.length} titles...`)
      }
    }
    console.log(`   ✓ Normalized ${normalizedCount} titles\n`)
  } else {
    console.log('   ℹ️  All titles already normalized\n')
  }

  // Step 7: Create GIN index for fuzzy search
  console.log('7️⃣  Creating GIN index for fuzzy search...')
  await sql`
    CREATE INDEX IF NOT EXISTS idx_netflix_search_text_trgm 
    ON netflix_shows USING gin (search_text gin_trgm_ops)
  `
  console.log('   ✓ Created GIN index (search_text)\n')

  console.log('✅ Setup complete!\n')
  console.log('📝 Next steps:')
  console.log('   1. Run `npm run embed` to generate embeddings (~20 min)')
  console.log('   2. Run `npm run dev` to start the development server')
  console.log('   3. Open the URL shown in terminal')
  console.log('')
  console.log('💡 Fuzzy search works immediately. Semantic search requires embeddings.')
}

main().catch((error) => {
  console.error('\n❌ Setup failed:', error.message)
  process.exit(1)
})
