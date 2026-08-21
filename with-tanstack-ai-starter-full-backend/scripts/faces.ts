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
import { sql, toVector } from '../src/lib/db'
import { rebuildPeople } from '../src/lib/faces-db'
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
  const rows = (await sql`select crop_key from faces where owner_id = ${ownerId}`) as { crop_key: string }[]
  for (const r of rows) {
    try {
      await deleteImage(r.crop_key)
    } catch {
      /* orphaned crop is harmless */
    }
  }
  await sql`delete from people where owner_id = ${ownerId}`
  await sql`delete from faces where owner_id = ${ownerId}`
  if (rows.length) console.log(`  cleared ${rows.length} existing faces`)
}

export async function processOwnerFaces(ownerId: string): Promise<void> {
  const photos = (await sql`select id, filename from photos where owner_id = ${ownerId} order by created_at`) as { id: string; filename: string }[]
  console.log(`  detecting faces across ${photos.length} photos …`)

  await clearExisting(ownerId)
  const h = await getHuman()
  const tf = h.tf

  let faceCount = 0
  let done = 0
  for (const photo of photos) {
    try {
      const bytes = new Uint8Array(await (await fetch(await imageUrl(photo.filename))).arrayBuffer())
      const imgT = tf.node.decodeImage(bytes, 3)
      const { face } = await h.detect(imgT)
      for (const f of face) {
        if (!f.embedding || f.embedding.length !== 1024 || f.score < SCORE_MIN) continue
        const faceId = crypto.randomUUID()
        const cropKey = `faces/${faceId}.jpg`
        await putImage(cropKey, await cropToJpeg(tf, imgT, f.box), 'image/jpeg')
        await sql`
          insert into faces (id, photo_id, owner_id, bbox, crop_key, score, embedding)
          values (${faceId}, ${photo.id}, ${ownerId}, ${JSON.stringify(f.box)}::jsonb, ${cropKey}, ${f.score}, ${toVector(normalize(f.embedding))}::vector)
        `
        faceCount++
      }
      imgT.dispose()
    } catch (err) {
      console.warn(`  skip ${photo.filename}: ${err instanceof Error ? err.message : err}`)
    }
    if (++done % 25 === 0 || done === photos.length) process.stdout.write(`  [${done}/${photos.length}] ${faceCount} faces so far\n`)
  }

  console.log('  grouping faces into people …')
  const people = await rebuildPeople(ownerId)
  console.log(`  ${faceCount} faces grouped into ${people} people.`)
}

async function resolveOwner(): Promise<string> {
  const email = process.env.SEED_OWNER_EMAIL ?? process.env.VITE_DEMO_EMAIL
  if (!email) throw new Error('set VITE_DEMO_EMAIL in .env.local')
  const rows = (await sql`select id from neon_auth."user" where email = ${email} limit 1`) as { id: string }[]
  if (!rows[0]) throw new Error(`owner ${email} not found, run npm run setup first`)
  return rows[0].id
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
