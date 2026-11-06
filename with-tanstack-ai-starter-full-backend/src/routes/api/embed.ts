import { createFileRoute } from '@tanstack/react-router'
import { CLIP_DIMS, embedImageBytes, embedText, MODEL_ID } from '@/lib/clip'
import { requireUser, Unauthorized } from '@/lib/verify'

/**
 * Embedding API, exposed for direct testing / warming.
 *
 *   GET  /api/embed                 liveness + model id
 *   POST /api/embed {"text":"..."}  text  -> 512-d vector
 *   POST /api/embed  (multipart)    image -> 512-d vector
 *
 * The model loads once per warm instance (see src/lib/clip). The first call
 * after a cold start pays the ~15-20s load, the rest are ~sub-second.
 */
export const Route = createFileRoute('/api/embed')({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, model: MODEL_ID, dims: CLIP_DIMS }),
      POST: async ({ request }) => {
        const started = performance.now()
        const contentType = request.headers.get('content-type') ?? ''
        try {
          await requireUser(request)
          if (contentType.includes('multipart/form-data')) {
            const form = await request.formData()
            const file = form.get('image')
            if (!(file instanceof File) || file.size === 0) {
              return Response.json({ error: 'no image uploaded (field "image")' }, { status: 400 })
            }
            const bytes = new Uint8Array(await file.arrayBuffer())
            const { embedding, width, height } = await embedImageBytes(bytes, file.type || 'image/jpeg')
            return Response.json({ embedding, dims: embedding.length, kind: 'image', width, height, ms: Math.round(performance.now() - started) })
          }
          const body = (await request.json().catch(() => ({}))) as { text?: string }
          const text = body.text?.trim()
          if (!text) return Response.json({ error: 'body must be { "text": "..." } or multipart image' }, { status: 400 })
          const embedding = await embedText(text)
          return Response.json({ embedding, dims: embedding.length, kind: 'text', ms: Math.round(performance.now() - started) })
        } catch (err) {
          if (err instanceof Unauthorized) return Response.json({ error: err.message }, { status: 401 })
          return Response.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 })
        }
      },
    },
  },
})
