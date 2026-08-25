/**
 * One command to recreate the entire demo library in YOUR Neon database.
 *
 * For every photo in demo-photos.json it downloads the image, embeds it with
 * CLIP, generates a caption (both self-hosted via transformers.js, no API
 * keys), uploads the bytes to Neon Object Storage, and inserts a row owned by
 * the demo account. Then it builds the Lakebase ANN index. Re-runnable: the
 * demo owner's library is cleared first, so a re-run rebuilds from scratch.
 *
 * Prerequisites (see README): .env filled in. This script does the whole
 * database bring-up itself: create the extensions, push the Drizzle schema,
 * then seed. Extensions must exist before the push (the schema declares
 * `vector(n)` columns), and the tables must exist before the seed.
 *
 *   npm run setup
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { captionImageBytes } from '../src/lib/caption'
import { embedImageBytes } from '../src/lib/clip'
import { db, toVector } from '../src/lib/db'
import { photos } from '../src/lib/schema'
import { deleteImage, putImage } from '../src/lib/storage'
import { processOwnerFaces } from './faces'

const MANIFEST = new URL('./demo-photos.json', import.meta.url)

// The Postgres extensions the schema needs, created before the push (the schema
// declares `vector(n)` columns). vector = pgvector, and lakebase_vector/lakebase_text
// back the lakebase_ann and BM25 search. Applied over the neon-http `db` client, no psql.
const EXTENSIONS = ['create extension if not exists vector', 'create extension if not exists lakebase_vector cascade', 'create extension if not exists lakebase_text cascade']

async function applyExtensions() {
  for (const ext of EXTENSIONS) {
    await db.execute(sql.raw(ext))
    console.log(`  ${ext}`)
  }
}

/** Make sure the demo account exists (so its owner_id is available), then return its id. */
async function ensureDemoUser(): Promise<string> {
  const email = process.env.SEED_OWNER_EMAIL ?? process.env.VITE_DEMO_EMAIL
  const password = process.env.VITE_DEMO_PASSWORD
  const authUrl = process.env.VITE_NEON_AUTH_URL
  if (!email) throw new Error('set VITE_DEMO_EMAIL in .env')

  // Best-effort sign-up. If the account already exists this just no-ops.
  if (authUrl && password) {
    try {
      const res = await fetch(`${authUrl}/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ name: 'Demo', email, password }),
      })
      if (res.ok) console.log(`  created demo account ${email}`)
    } catch {
      /* ignore, fall through to the lookup */
    }
  }

  const { rows } = await db.execute(sql`select id from neon_auth."user" where email = ${email} limit 1`)
  const row = rows[0] as { id: string } | undefined
  if (!row) throw new Error(`demo account ${email} not found, sign it up in the app first (or set VITE_NEON_AUTH_URL + VITE_DEMO_PASSWORD so this can), then re-run`)
  return row.id
}

async function clearExisting(ownerId: string) {
  const rows = await db.select({ filename: photos.filename }).from(photos).where(eq(photos.ownerId, ownerId))
  for (const r of rows) {
    try {
      await deleteImage(r.filename)
    } catch {
      /* orphaned object is harmless */
    }
  }
  await db.delete(photos).where(eq(photos.ownerId, ownerId))
  if (rows.length) console.log(`  cleared ${rows.length} existing photos`)
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

async function buildIndex() {
  await db.execute(sql`drop index if exists photos_embedding_ann`)
  await db.execute(sql`
    create index photos_embedding_ann on photos
    using lakebase_ann (embedding vector_cosine_ops)
    with (build_mode = 'standard')
  `)
}

// drizzle-kit is a CLI with no importable `push`, so shell out. It inherits this
// process's env (the vars dotenvx injected), so drizzle.config.ts sees DATABASE_URL.
function pushSchema() {
  execSync('drizzle-kit push', { stdio: 'inherit' })
}

async function main() {
  const urls = JSON.parse(readFileSync(MANIFEST, 'utf8')) as string[]

  console.log('  creating extensions …')
  await applyExtensions()
  console.log('  pushing the Drizzle schema …')
  pushSchema()

  console.log(`Recreating the demo library, ${urls.length} photos.`)
  const ownerId = await ensureDemoUser()
  await clearExisting(ownerId)

  console.log('  loading models (first run downloads them) …')

  let inserted = 0
  for (const url of urls) {
    const filename = basename(new URL(url).pathname)
    const id = filename.replace(/\.[a-z]+$/i, '')
    try {
      const bytes = await download(url)
      const { embedding, width, height } = await embedImageBytes(bytes)
      const caption = await captionImageBytes(bytes)
      await putImage(filename, bytes)
      await db
        .insert(photos)
        .values({ id, ownerId, filename, width, height, embedding: toVector(embedding), caption })
        .onConflictDoNothing()
      inserted++
      if (inserted % 10 === 0 || inserted === 1) process.stdout.write(`  [${inserted}/${urls.length}] ${filename}: "${caption}"\n`)
    } catch (err) {
      console.warn(`  skip ${filename}: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log('  building the lakebase_ann index …')
  await buildIndex()

  console.log('  detecting and grouping faces …')
  await processOwnerFaces(ownerId)

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(photos)
    .where(eq(photos.ownerId, ownerId))
  console.log(`Done. ${count} photos in the demo library, indexed and searchable, faces grouped.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
