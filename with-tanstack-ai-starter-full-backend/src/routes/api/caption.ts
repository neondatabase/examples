import { createFileRoute } from '@tanstack/react-router'
import { captionImageBytes } from '@/lib/caption'
import { sql } from '@/lib/db'
import { imageUrl } from '@/lib/storage'
import { requireUser, Unauthorized } from '@/lib/verify'

/**
 * POST /api/caption  { id }  ->  { id, caption }
 *
 * Generates a caption for one of the caller's photos with ViT-GPT2. It lives in
 * its own route because that model plus CLIP won't both fit in a single Vercel
 * function's /tmp, so the upload route embeds (CLIP) and this one captions
 * (ViT-GPT2), each with the model to itself. The photo is looked up scoped to the
 * verified owner, so a caller can only caption their own photos.
 */
export const Route = createFileRoute('/api/caption')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const uid = await requireUser(request)
          const { id } = (await request.json()) as { id?: string }
          if (!id) return Response.json({ error: 'missing photo id' }, { status: 400 })
          const rows = (await sql`select filename from photos where id = ${id} and owner_id = ${uid} limit 1`) as { filename: string }[]
          if (!rows[0]) return Response.json({ error: 'photo not found' }, { status: 404 })
          const bytes = new Uint8Array(await (await fetch(await imageUrl(rows[0].filename))).arrayBuffer())
          const caption = await captionImageBytes(bytes)
          await sql`update photos set caption = ${caption} where id = ${id} and owner_id = ${uid}`
          return Response.json({ id, caption })
        } catch (err) {
          if (err instanceof Unauthorized) return Response.json({ error: err.message }, { status: 401 })
          return Response.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 })
        }
      },
    },
  },
})
