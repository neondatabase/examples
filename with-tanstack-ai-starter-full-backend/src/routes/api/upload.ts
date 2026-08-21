import { createFileRoute } from '@tanstack/react-router'
import { embedImageBytes } from '@/lib/clip'
import { sql, toVector } from '@/lib/db'
import { imageUrl, putImage } from '@/lib/storage'
import { requireUser, Unauthorized } from '@/lib/verify'

/**
 * POST /api/upload  (multipart: image)  ->  the new photo card
 *
 * The write path. It embeds the image with CLIP, stores the bytes in Neon Object
 * Storage, and inserts a row **owned by the verified user**, owner_id comes from
 * the JWT `sub`, never from the client. So a user can only ever add to their own
 * library, and RLS then scopes every later read to them. The caption is filled in
 * afterwards by /api/caption (a separate model that can't share this one's /tmp).
 */
export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const uid = await requireUser(request)
          const form = await request.formData()
          const file = form.get('image')
          if (!(file instanceof File) || file.size === 0) return Response.json({ error: 'no image uploaded' }, { status: 400 })
          if (!file.type.startsWith('image/')) return Response.json({ error: `${file.type || 'that file'} is not an image` }, { status: 415 })
          const bytes = new Uint8Array(await file.arrayBuffer())
          const contentType = file.type || 'image/jpeg'
          const { embedding, width, height } = await embedImageBytes(bytes, contentType)
          const id = crypto.randomUUID()
          const filename = `${id}.jpg`
          await putImage(filename, bytes, contentType)
          const caption = (form.get('caption') as string | null)?.trim() || ''
          await sql`
            insert into photos (id, filename, width, height, embedding, caption, owner_id)
            values (${id}, ${filename}, ${width}, ${height}, ${toVector(embedding)}::vector, ${caption}, ${uid})
          `
          return Response.json({ id, filename, url: await imageUrl(filename), caption, width, height, distance: 0 })
        } catch (err) {
          if (err instanceof Unauthorized) return Response.json({ error: err.message }, { status: 401 })
          return Response.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 })
        }
      },
    },
  },
})
