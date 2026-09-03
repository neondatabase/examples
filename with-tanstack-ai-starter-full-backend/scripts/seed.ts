/**
 * Seed the demo photo library from the Next.js Conf photo set.
 *
 * The image URLs (originals on Vercel Blob) live in demo-photos.json. For each:
 * download the JPEG, embed it with CLIP (transformers.js → 512-d), upload the
 * bytes to Neon Object Storage, and insert a row owned by the demo account so
 * the owner-scoped read functions return it once you sign in as that user.
 *
 * The demo library is *replaced* on each run: existing photos for the owner (and
 * their storage objects) are cleared first. The demo account must already exist
 * (run `npm run setup`), then run this.
 *
 *   npm run seed
 */
import { readFileSync } from 'node:fs'
import { eq, sql } from 'drizzle-orm'
import { embedImageBytes } from '../src/lib/clip'
import { db, toVector } from '../src/lib/db'
import { DEMO_EMAIL } from '../src/lib/demo'
import { photos } from '../src/lib/schema'
import { deleteImage, putImage } from '../src/lib/storage'

const MANIFEST = new URL('./demo-photos.json', import.meta.url)

/** The demo account's user id, so seeded rows are owned by (and returned to) it. */
async function resolveOwnerId(): Promise<string> {
  const { rows } = await db.execute(sql`select id from neon_auth."user" where email = ${DEMO_EMAIL} limit 1`)
  const row = rows[0] as { id: string } | undefined
  if (!row) throw new Error(`no user ${DEMO_EMAIL}, run npm run setup first`)
  return row.id
}

async function clearExisting(ownerId: string) {
  const rows = await db.select({ filename: photos.filename }).from(photos).where(eq(photos.ownerId, ownerId))
  for (const r of rows) {
    try {
      await deleteImage(r.filename)
    } catch (err) {
      console.warn(`  could not delete ${r.filename}: ${err instanceof Error ? err.message : err}`)
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

async function main() {
  const urls = JSON.parse(readFileSync(MANIFEST, 'utf8')) as string[]
  console.log(`Seeding ${urls.length} photos from the Next.js Conf set …`)

  const ownerId = await resolveOwnerId()
  await clearExisting(ownerId)

  let inserted = 0
  for (const url of urls) {
    // UUID key, not the source filename, so stored objects match the app's upload
    // path (api/upload) and carry nothing from where the demo images came from.
    const id = crypto.randomUUID()
    const filename = `${id}.jpg`
    try {
      const bytes = await download(url)
      const { embedding, width, height } = await embedImageBytes(bytes)
      await putImage(filename, bytes)
      await db
        .insert(photos)
        .values({ id, ownerId, filename, width, height, embedding: toVector(embedding) })
        .onConflictDoNothing()
      inserted++
      if (inserted % 10 === 0 || inserted === 1) process.stdout.write(`  [${inserted}/${urls.length}] ${filename}\n`)
    } catch (err) {
      console.warn(`  skip ${filename}: ${err instanceof Error ? err.message : err}`)
    }
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(photos)
    .where(eq(photos.ownerId, ownerId))
  console.log(`Done. Inserted ${inserted}; ${count} photos in the demo library.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
