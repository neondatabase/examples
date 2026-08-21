import { mkdirSync } from 'node:fs'
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  env,
  RawImage,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  type Processor,
} from '@huggingface/transformers'

export const MODEL_ID = 'Xenova/clip-vit-base-patch32'
export const CLIP_DIMS = 512

// transformers.js caches weights under node_modules by default, which is
// read-only on Vercel's serverless filesystem. /tmp is the only writable path
// there and survives for the life of a warm instance, so the download happens
// once per cold start, not once per request. The dir must exist before
// transformers.js writes to it, so create it up front. We use q8 weights so CLIP
// and the ViT-GPT2 captioner (see src/lib/caption.ts) both fit in the small /tmp.
//
// Locally we leave the default (node_modules cache) alone, it is writable and
// persists across restarts, so dev never re-downloads.
if (process.env.VERCEL) {
  const dir = '/tmp/transformers-cache'
  mkdirSync(dir, { recursive: true })
  env.cacheDir = dir
}

// Both towers are loaded lazily and kept as module-scope singletons: the weights
// download once and stay resident for the life of the process. This is exactly
// the property a Neon Function gives us and a cold lambda does not.
let textTower: Promise<{ tokenizer: PreTrainedTokenizer; model: PreTrainedModel }> | null = null
let visionTower: Promise<{ processor: Processor; model: PreTrainedModel }> | null = null

// A load can fail transiently (a dropped connection mid-download of the ~90MB
// vision weights). We cache the *promise*, so a naive `x ??= load()` would cache
// the rejection forever and every later request would fail instantly against a
// poisoned singleton. Reset the slot on failure so the next request retries.
function loadTextTower() {
  textTower ??= (async () => ({
    tokenizer: await AutoTokenizer.from_pretrained(MODEL_ID),
    model: await CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8' }),
  }))().catch((err) => {
    textTower = null
    throw err
  })
  return textTower
}

function loadVisionTower() {
  visionTower ??= (async () => ({
    processor: await AutoProcessor.from_pretrained(MODEL_ID),
    model: await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8' }),
  }))().catch((err) => {
    visionTower = null
    throw err
  })
  return visionTower
}

// CLIP's projection heads do not emit unit vectors (raw norms ~8-12), so we
// normalise once at write time. Ranking by cosine survives either way, but the
// distances only mean something normalised, and an inner-product index would
// otherwise rank by magnitude instead of angle.
function normalise(v: ArrayLike<number>): number[] {
  let sumSquares = 0
  for (let i = 0; i < v.length; i++) sumSquares += v[i]! * v[i]!
  const norm = Math.sqrt(sumSquares)
  if (norm === 0) throw new Error('cannot normalise a zero vector')
  const out = new Array<number>(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / norm
  return out
}

function unbatch(tensor: { data: ArrayLike<number> }, batchSize: number): number[][] {
  const flat = tensor.data
  const dims = flat.length / batchSize
  if (dims !== CLIP_DIMS) {
    throw new Error(`expected ${CLIP_DIMS}-d embeddings, model returned ${dims}`)
  }
  const rows: number[][] = []
  for (let i = 0; i < batchSize; i++) {
    rows.push(normalise(Array.prototype.slice.call(flat, i * dims, (i + 1) * dims)))
  }
  return rows
}

/** Embed text with the text tower. CLIP's context window is 77 tokens, so we truncate to let a long query fail soft. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const { tokenizer, model } = await loadTextTower()
  const inputs = tokenizer(texts, { padding: true, truncation: true })
  const { text_embeds } = await model(inputs)
  return unbatch(text_embeds, texts.length)
}

export async function embedText(text: string): Promise<number[]> {
  return (await embedTexts([text]))[0]!
}

export type ImageInput = string | Blob | RawImage

async function toRawImage(input: ImageInput): Promise<RawImage> {
  if (input instanceof RawImage) return input
  if (typeof input === 'string') return RawImage.read(input)
  return RawImage.fromBlob(input)
}

/** Embed images with the vision tower, returning source dimensions for grid layout. */
export async function embedImages(inputs: ImageInput[]): Promise<{ embedding: number[]; width: number; height: number }[]> {
  if (inputs.length === 0) return []
  const { processor, model } = await loadVisionTower()
  const images = await Promise.all(inputs.map(toRawImage))
  const pixels = await processor(images)
  const { image_embeds } = await model(pixels)
  const embeddings = unbatch(image_embeds, images.length)
  return embeddings.map((embedding, i) => ({
    embedding,
    width: images[i]!.width,
    height: images[i]!.height,
  }))
}

export async function embedImage(input: ImageInput) {
  return (await embedImages([input]))[0]!
}

/** Convenience: embed raw image bytes (what an upload or a fetch gives you). */
export async function embedImageBytes(bytes: Uint8Array, contentType = 'image/jpeg') {
  return embedImage(new Blob([bytes as BlobPart], { type: contentType }))
}

export { RawImage }
