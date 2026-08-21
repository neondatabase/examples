import { mkdirSync } from 'node:fs'
import { env, pipeline, RawImage } from '@huggingface/transformers'

// Same self-hosted image-to-text model the seed/setup scripts use. Loaded once
// per warm instance and kept in module scope, so the first request pays the
// download and every caption after it is fast.
const MODEL_ID = 'Xenova/vit-gpt2-image-captioning'

// node_modules is read-only on Vercel, so cache the weights in /tmp (writable,
// survives a warm instance). Mirrors src/lib/clip.ts.
if (process.env.VERCEL) {
  const dir = '/tmp/transformers-cache'
  mkdirSync(dir, { recursive: true })
  env.cacheDir = dir
}

// The transformers pipeline() return type is a giant union, so we narrow to just
// what we use, an image-to-text callable.
type Captioner = (input: RawImage) => Promise<Array<{ generated_text?: string }>>

let captioner: Promise<Captioner> | null = null
function load(): Promise<Captioner> {
  // Quantized weights: CLIP (fp32) is already resident in the upload route, and
  // both models' weights have to fit in Vercel's small /tmp. q8 keeps the caption
  // model light without touching the CLIP embeddings that search depends on.
  // Reset the slot on failure so a transient download error doesn't poison the singleton.
  captioner ??= (pipeline('image-to-text', MODEL_ID, { dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' } }) as unknown as Promise<Captioner>).catch((err) => {
    captioner = null
    throw err
  })
  return captioner
}

/** Generate a caption for raw image bytes. Returns '' if the model produces nothing. */
export async function captionImageBytes(bytes: Uint8Array, contentType = 'image/jpeg'): Promise<string> {
  const model = await load()
  const img = await RawImage.fromBlob(new Blob([bytes as BlobPart], { type: contentType }))
  const out = await model(img)
  return out[0]?.generated_text?.trim() ?? ''
}
