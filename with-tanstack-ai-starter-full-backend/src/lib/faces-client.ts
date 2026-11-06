import type { Config, Human } from '@vladmandic/human'

/**
 * Browser-side face detection for the upload path.
 *
 * Running @vladmandic/human in the browser (its native habitat, on WebGL) keeps
 * the face models off the Vercel function, whose small /tmp is already shared by
 * CLIP and the captioner. On upload the client detects faces here, crops each
 * one, and posts the descriptors to /api/faces. The server never loads a face
 * model. Weights come from the jsdelivr CDN, pinned to the installed version.
 *
 * Human is imported dynamically so its ~2MB bundle is a lazy chunk that only
 * loads the first time someone uploads, never on the initial library paint.
 */
const config: Partial<Config> = {
  modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/models/',
  backend: 'humangl',
  cacheModels: true,
  filter: { enabled: false },
  face: {
    enabled: true,
    detector: { maxDetected: 20, minConfidence: 0.2 },
    mesh: { enabled: true },
    description: { enabled: true }, // the 1024-d faceres descriptor we group on
    iris: { enabled: false },
    emotion: { enabled: false },
    antispoof: { enabled: false },
    liveness: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
}

let humanPromise: Promise<Human> | null = null
function getHuman(): Promise<Human> {
  humanPromise ??= (async () => {
    const { default: HumanCtor } = await import('@vladmandic/human')
    const human = new HumanCtor(config)
    await human.load()
    return human
  })().catch((err) => {
    humanPromise = null
    throw err
  })
  return humanPromise
}

export type DetectedFace = {
  bbox: [number, number, number, number] // [x, y, width, height] in source pixels
  embedding: number[] // L2-normalized, ready for cosine similarity
  score: number
  crop: Blob // a padded jpeg crop of the face, for the person circle
}

function normalize(v: number[]): number[] {
  let sum = 0
  for (const x of v) sum += x * x
  const norm = Math.sqrt(sum)
  return norm === 0 ? v : v.map((x) => x / norm)
}

/** Crop a padded square around the face box and return it as a small jpeg. */
async function cropFace(bitmap: ImageBitmap, box: [number, number, number, number]): Promise<Blob> {
  const [x, y, w, h] = box
  const pad = Math.round(Math.max(w, h) * 0.3)
  const side = Math.max(w, h) + pad * 2
  const cx = x + w / 2
  const cy = y + h / 2
  const sx = Math.max(0, Math.round(cx - side / 2))
  const sy = Math.max(0, Math.round(cy - side / 2))
  const sw = Math.min(bitmap.width - sx, side)
  const sh = Math.min(bitmap.height - sy, side)
  const out = 160
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, out, out)
  return new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9))
}

/** Detect, embed, and crop every face in an image file. */
export async function detectFaces(file: File | Blob): Promise<DetectedFace[]> {
  const human = await getHuman()
  const bitmap = await createImageBitmap(file)
  try {
    const { face } = await human.detect(bitmap)
    const faces: DetectedFace[] = []
    for (const f of face) {
      if (!f.embedding || f.embedding.length === 0) continue
      faces.push({
        bbox: f.box,
        embedding: normalize(f.embedding),
        score: f.score,
        crop: await cropFace(bitmap, f.box),
      })
    }
    return faces
  } finally {
    bitmap.close()
  }
}
