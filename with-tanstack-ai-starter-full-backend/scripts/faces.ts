/**
 * Detect and group faces across a library, offline.
 *
 * For every photo the owner has, this runs @vladmandic/human (via tfjs-node, so
 * no browser and no API keys), embeds each detected face as a 1024-d descriptor,
 * crops the face for its person circle, and stores it. Then it groups the faces
 * into people with Chinese Whispers (see src/lib/faces-db). Re-runnable: the
 * owner's existing faces and crops are cleared first.
 *
 * `npm run setup` calls this after seeding photos. To (re)run it on its own:
 *   npm run faces
 *
 * tfjs-node and the human models are dev-only, they never ship to Vercel, where
 * uploads detect faces in the browser instead (src/lib/faces-client).
 */
import { resolve } from 'node:path'
import { Human } from '@vladmandic/human'
import { eq, sql } from 'drizzle-orm'
import { db, toVector } from '../src/lib/db'
import { DEMO_EMAIL } from '../src/lib/demo'
import { rebuildPeople } from '../src/lib/faces-db'
import { faces, people, photos } from '../src/lib/schema'
import { deleteImage, imageUrl, putImage } from '../src/lib/storage'

const MODELS = `file://${resolve(process.cwd(), 'node_modules/@vladmandic/human/models')}/`
// Below this detector confidence a "face" is usually a pattern in the background,
// not a person, so we skip it rather than let it pollute the clustering.
const SCORE_MIN = 0.5

let human: Human | null = null
async function getHuman(): Promise<Human> {
  if (human) return human
  const h = new Human({
    backend: 'tensorflow',
    modelBasePath: MODELS,
    cacheModels: false,
    filter: { enabled: false },
    face: {
      enabled: true,
      detector: { maxDetected: 20, minConfidence: 0.3 },
      mesh: { enabled: true },
      description: { enabled: true }, // the 1024-d faceres descriptor
      iris: { enabled: false },
      emotion: { enabled: false },
      antispoof: { enabled: false },
      liveness: { enabled: false },
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: false },
  })
  await h.load()
  human = h
  return h
}

function normalize(v: number[]): number[] {
  let sum = 0
  for (const x of v) sum += x * x
  const norm = Math.sqrt(sum)
  return norm === 0 ? v : v.map((x) => x / norm)
}

/** Crop a padded square around a face box and JPEG-encode it, all on the GPU/CPU tensor. */
async function cropToJpeg(tf: Human['tf'], imgT: { shape: number[] }, box: [number, number, number, number]): Promise<Uint8Array> {
  const [H, W] = imgT.shape as [number, number, number]
  const [x, y, w, h] = box.map(Math.round)
  const pad = Math.round(Math.max(w, h) * 0.3)
  const side = Math.max(w, h) + pad * 2
  const sx = Math.max(0, Math.round(x + w / 2 - side / 2))
  const sy = Math.max(0, Math.round(y + h / 2 - side / 2))
  const sw = Math.min(W - sx, side)
  const sh = Math.min(H - sy, side)
  const crop = tf.tidy(() => tf.image.resizeBilinear(tf.slice(imgT, [sy, sx, 0], [sh, sw, 3]), [160, 160]).toInt())
  const jpeg = (await tf.node.encodeJpeg(crop, 'rgb', 90)) as Uint8Array
  crop.dispose()
  return jpeg
}

async function clearExisting(ownerId: string) {
  const rows = await db.select({ crop_key: faces.cropKey }).from(faces).where(eq(faces.ownerId, ownerId))
  for (const r of rows) {
    try {
      await deleteImage(r.crop_key)
    } catch {
      /* orphaned crop is harmless */
    }
  }
  await db.delete(people).where(eq(people.ownerId, ownerId))
  await db.delete(faces).where(eq(faces.ownerId, ownerId))
  if (rows.length) console.log(`  cleared ${rows.length} existing faces`)
}

export async function processOwnerFaces(ownerId: string): Promise<void> {
  const ownerPhotos = await db.select({ id: photos.id, filename: photos.filename }).from(photos).where(eq(photos.ownerId, ownerId)).orderBy(photos.createdAt)
  console.log(`  detecting faces across ${ownerPhotos.length} photos …`)

  await clearExisting(ownerId)
  const h = await getHuman()
  const tf = h.tf

  let faceCount = 0
  let done = 0
  for (const photo of ownerPhotos) {
    try {
      const bytes = new Uint8Array(await (await fetch(await imageUrl(photo.filename))).arrayBuffer())
      const imgT = tf.node.decodeImage(bytes, 3)
      const { face } = await h.detect(imgT)
      for (const f of face) {
        if (!f.embedding || f.embedding.length !== 1024 || f.score < SCORE_MIN) continue
        const faceId = crypto.randomUUID()
        const cropKey = `faces/${faceId}.jpg`
        await putImage(cropKey, await cropToJpeg(tf, imgT, f.box), 'image/jpeg')
        await db.insert(faces).values({ id: faceId, photoId: photo.id, ownerId, bbox: f.box, cropKey, score: f.score, embedding: toVector(normalize(f.embedding)) })
        faceCount++
      }
      imgT.dispose()
    } catch (err) {
      console.warn(`  skip ${photo.filename}: ${err instanceof Error ? err.message : err}`)
    }
    if (++done % 25 === 0 || done === ownerPhotos.length) process.stdout.write(`  [${done}/${ownerPhotos.length}] ${faceCount} faces so far\n`)
  }

  console.log('  grouping faces into people …')
  const peopleCount = await rebuildPeople(ownerId)
  console.log(`  ${faceCount} faces grouped into ${peopleCount} people.`)
}

async function resolveOwner(): Promise<string> {
  const { rows } = await db.execute(sql`select id from neon_auth."user" where email = ${DEMO_EMAIL} limit 1`)
  const row = rows[0] as { id: string } | undefined
  if (!row) throw new Error(`owner ${DEMO_EMAIL} not found, run npm run setup first`)
  return row.id
}

// Run standalone (npm run faces). When called from setup.ts, processOwnerFaces
// is imported directly, so this block does not execute there.
if (import.meta.url === `file://${process.argv[1]}`) {
  resolveOwner()
    .then(processOwnerFaces)
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
