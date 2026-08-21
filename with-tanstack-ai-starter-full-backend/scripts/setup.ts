/**
 * One command to recreate the entire demo library in YOUR Neon database.
 *
 * For every photo in demo-photos.json it downloads the image, embeds it with
 * CLIP, generates a caption (both self-hosted via transformers.js, no API
 * keys), uploads the bytes to Neon Object Storage, and inserts a row owned by
 * the demo account. Then it builds the Lakebase ANN index. Re-runnable: the
 * demo owner's library is cleared first, so a re-run rebuilds from scratch.
 *
 * Prerequisites (see README): .env.local filled in, and the schema applied:
 * `npm run setup` runs the schema first, then this script.
 *
 *   npm run setup
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { captionImageBytes } from '../src/lib/caption'
import { embedImageBytes } from '../src/lib/clip'
import { sql, toVector } from '../src/lib/db'
import { deleteImage, putImage } from '../src/lib/storage'
import { processOwnerFaces } from './faces'

const MANIFEST = new URL('./demo-photos.json', import.meta.url)

/** Make sure the demo account exists (so its RLS owner_id is available), then return its id. */
async function ensureDemoUser(): Promise<string> {
  const email = process.env.SEED_OWNER_EMAIL ?? process.env.VITE_DEMO_EMAIL
  const password = process.env.VITE_DEMO_PASSWORD
  const authUrl = process.env.VITE_NEON_AUTH_URL
  if (!email) throw new Error('set VITE_DEMO_EMAIL in .env.local')

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

  const rows = (await sql`select id from neon_auth."user" where email = ${email} limit 1`) as { id: string }[]
  if (!rows[0]) throw new Error(`demo account ${email} not found, sign it up in the app first (or set VITE_NEON_AUTH_URL + VITE_DEMO_PASSWORD so this can), then re-run`)
  return rows[0].id
}

async function clearExisting(ownerId: string) {
  const rows = (await sql`select filename from photos where owner_id = ${ownerId}`) as { filename: string }[]
  for (const r of rows) {
    try {
      await deleteImage(r.filename)
    } catch {
      /* orphaned object is harmless */
    }
  }
  await sql`delete from photos where owner_id = ${ownerId}`
  if (rows.length) console.log(`  cleared ${rows.length} existing photos`)
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

async function buildIndex() {
  await sql`drop index if exists photos_embedding_ann`
  await sql`
    create index photos_embedding_ann on photos
    using lakebase_ann (embedding vector_cosine_ops)
    with (build_mode = 'standard')
  `
}

async function main() {
  const urls = JSON.parse(readFileSync(MANIFEST, 'utf8')) as string[]
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
      await sql`
        insert into photos (id, owner_id, filename, width, height, embedding, caption)
        values (${id}, ${ownerId}, ${filename}, ${width}, ${height}, ${toVector(embedding)}::vector, ${caption})
        on conflict (id) do nothing
      `
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

  const [{ count }] = (await sql`select count(*)::int as count from photos where owner_id = ${ownerId}`) as { count: number }[]
  console.log(`Done. ${count} photos in the demo library, indexed and searchable, faces grouped.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
