import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { captionImageBytes } from '@/lib/caption'
import { db } from '@/lib/db'
import { photos } from '@/lib/schema'
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
          const [row] = await db
            .select({ filename: photos.filename })
            .from(photos)
            .where(and(eq(photos.id, id), eq(photos.ownerId, uid)))
            .limit(1)
          if (!row) return Response.json({ error: 'photo not found' }, { status: 404 })
          const bytes = new Uint8Array(await (await fetch(await imageUrl(row.filename))).arrayBuffer())
          const caption = await captionImageBytes(bytes)
          await db
            .update(photos)
            .set({ caption })
            .where(and(eq(photos.id, id), eq(photos.ownerId, uid)))
          return Response.json({ id, caption })
        } catch (err) {
          if (err instanceof Unauthorized) return Response.json({ error: err.message }, { status: 401 })
          return Response.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 })
        }
      },
    },
  },
})
