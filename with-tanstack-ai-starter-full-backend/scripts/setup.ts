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
import { eq, sql } from 'drizzle-orm'
import { captionImage } from '../src/lib/caption'
import { embedImages, RawImage } from '../src/lib/clip'
import { db, toVector } from '../src/lib/db'
import { DEMO_EMAIL, DEMO_PASSWORD } from '../src/lib/demo'
import { photos } from '../src/lib/schema'
import { deleteImage, putImage } from '../src/lib/storage'
import { processOwnerFaces } from './faces'

const MANIFEST = new URL('./demo-photos.json', import.meta.url)

// Photos per wave. The wave downloads and uploads in parallel and embeds in one CLIP
// forward pass, so the only serial CPU cost left is the (autoregressive) captioning.
const BATCH = 12

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
  const authUrl = process.env.VITE_NEON_AUTH_URL
  if (!authUrl) throw new Error('set VITE_NEON_AUTH_URL in .env so setup can create the demo account')

  // Best-effort sign-up with the hard-coded demo credentials (src/lib/demo). If the
  // account already exists this fails and we fall through to the lookup. Any other
  // failure (untrusted origin, wrong auth URL) is kept as a hint so the "not found"
  // error below can explain what actually happened.
  let signUpHint = ''
  try {
    const res = await fetch(`${authUrl}/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ name: 'Demo', email: DEMO_EMAIL, password: DEMO_PASSWORD }),
    })
    if (res.ok) console.log(`  created demo account ${DEMO_EMAIL}`)
    else signUpHint = ` (sign-up returned ${res.status}: ${(await res.text()).slice(0, 200)})`
  } catch (err) {
    signUpHint = ` (sign-up request failed: ${err instanceof Error ? err.message : err})`
  }

  const { rows } = await db.execute(sql`select id from neon_auth."user" where email = ${DEMO_EMAIL} limit 1`)
  const row = rows[0] as { id: string } | undefined
  if (!row) throw new Error(`demo account ${DEMO_EMAIL} not found${signUpHint}. Check VITE_NEON_AUTH_URL, then re-run`)
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
  for (let start = 0; start < urls.length; start += BATCH) {
    // Download this wave in parallel and decode each JPEG once (the RawImage feeds
    // both the embedder and the captioner). A failed download drops just that photo.
    // UUID keys, not the source filenames, so stored objects match the app's upload
    // path (api/upload) and carry nothing from where the demo images came from.
    const items = (
      await Promise.all(
        urls.slice(start, start + BATCH).map(async (url) => {
          try {
            const bytes = await download(url)
            const img = await RawImage.fromBlob(new Blob([bytes as BlobPart], { type: 'image/jpeg' }))
            const id = crypto.randomUUID()
            return { id, filename: `${id}.jpg`, bytes, img }
          } catch (err) {
            console.warn(`  skip ${url}: ${err instanceof Error ? err.message : err}`)
            return null
          }
        }),
      )
    ).filter((it): it is NonNullable<typeof it> => it !== null)
    if (items.length === 0) continue

    // Upload the bytes to storage in parallel, overlapped with the model work below.
    const uploads = Promise.all(items.map((it) => putImage(it.filename, it.bytes)))
    // One CLIP forward pass for the whole wave, then caption each (the serial CPU floor).
    const embeds = await embedImages(items.map((it) => it.img))
    const captions: string[] = []
    for (const it of items) captions.push(await captionImage(it.img))
    await uploads

    // One bulk insert per wave, not one round trip per photo.
    await db
      .insert(photos)
      .values(
        items.map((it, i) => ({
          id: it.id,
          ownerId,
          filename: it.filename,
          width: embeds[i]!.width,
          height: embeds[i]!.height,
          embedding: toVector(embeds[i]!.embedding),
          caption: captions[i]!,
        })),
      )
      .onConflictDoNothing()
    inserted += items.length
    process.stdout.write(`  [${inserted}/${urls.length}] +${items.length}, e.g. "${captions[0]}"\n`)
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
