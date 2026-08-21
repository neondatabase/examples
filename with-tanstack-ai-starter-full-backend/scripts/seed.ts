/**
 * Seed the demo photo library from the Next.js Conf photo set.
 *
 * The image URLs (originals on Vercel Blob) live in demo-photos.json. For each:
 * download the JPEG, embed it with CLIP (transformers.js → 512-d), upload the
 * bytes to Neon Object Storage, and insert a row owned by the demo account so
 * RLS makes it visible once you sign in as that user.
 *
 * The demo library is *replaced* on each run: existing photos for the owner (and
 * their storage objects) are cleared first. Sign the account up first
 * (SEED_OWNER_EMAIL, defaulting to VITE_DEMO_EMAIL), then run this.
 *
 *   npm run seed
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { embedImageBytes } from '../src/lib/clip'
import { sql, toVector } from '../src/lib/db'
import { deleteImage, putImage } from '../src/lib/storage'

const MANIFEST = new URL('./demo-photos.json', import.meta.url)

/** The demo account's user id, so seeded rows are visible to it under RLS. */
async function resolveOwnerId(): Promise<string> {
  const email = process.env.SEED_OWNER_EMAIL ?? process.env.VITE_DEMO_EMAIL
  if (!email) throw new Error('set SEED_OWNER_EMAIL (or VITE_DEMO_EMAIL) to the demo account email')
  const rows = (await sql`select id from neon_auth."user" where email = ${email} limit 1`) as { id: string }[]
  if (!rows[0]) throw new Error(`no user ${email}, sign that account up in the app first, then re-run seed`)
  return rows[0].id
}

async function clearExisting(ownerId: string) {
  const rows = (await sql`select filename from photos where owner_id = ${ownerId}`) as { filename: string }[]
  for (const r of rows) {
    try {
      await deleteImage(r.filename)
    } catch (err) {
      console.warn(`  could not delete ${r.filename}: ${err instanceof Error ? err.message : err}`)
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

async function main() {
  const urls = JSON.parse(readFileSync(MANIFEST, 'utf8')) as string[]
  console.log(`Seeding ${urls.length} photos from the Next.js Conf set …`)

  const ownerId = await resolveOwnerId()
  await clearExisting(ownerId)

  let inserted = 0
  for (const url of urls) {
    const filename = basename(new URL(url).pathname)
    const id = filename.replace(/\.[a-z]+$/i, '')
    try {
      const bytes = await download(url)
      const { embedding, width, height } = await embedImageBytes(bytes)
      await putImage(filename, bytes)
      await sql`
        insert into photos (id, owner_id, filename, width, height, embedding)
        values (${id}, ${ownerId}, ${filename}, ${width}, ${height}, ${toVector(embedding)}::vector)
        on conflict (id) do nothing
      `
      inserted++
      if (inserted % 10 === 0 || inserted === 1) process.stdout.write(`  [${inserted}/${urls.length}] ${filename}\n`)
    } catch (err) {
      console.warn(`  skip ${filename}: ${err instanceof Error ? err.message : err}`)
    }
  }

  const [{ count }] = (await sql`select count(*)::int as count from photos where owner_id = ${ownerId}`) as { count: number }[]
  console.log(`Done. Inserted ${inserted}; ${count} photos in the demo library.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
