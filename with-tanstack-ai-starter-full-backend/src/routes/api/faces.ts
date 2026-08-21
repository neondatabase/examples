import { createFileRoute } from '@tanstack/react-router'
import { sql, toVector } from '@/lib/db'
import { rebuildPeople } from '@/lib/faces-db'
import { putImage } from '@/lib/storage'
import { requireUser, Unauthorized } from '@/lib/verify'

/**
 * POST /api/faces  (multipart)  ->  { faces, people }
 *
 * The face-write path for uploads. The browser detects and embeds faces with
 * @vladmandic/human (see src/lib/faces-client), then posts here:
 *   - photo_id : the photo the faces belong to (checked against the owner)
 *   - faces    : JSON [{ bbox, embedding, score }], one per detected face
 *   - crops    : the matching face-crop jpegs, in the same order
 *
 * No face model runs on the server, so this stays clear of the CLIP/caption /tmp
 * budget. It stores the crops, inserts owner-scoped face rows, then regroups the
 * owner's faces into people. owner_id comes from the verified JWT, never the client.
 */
type FaceMeta = { bbox: [number, number, number, number]; embedding: number[]; score: number }

export const Route = createFileRoute('/api/faces')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const uid = await requireUser(request)
          const form = await request.formData()
          const photoId = form.get('photo_id')
          if (typeof photoId !== 'string' || !photoId) return Response.json({ error: 'missing photo_id' }, { status: 400 })
          const owns = (await sql`select 1 from photos where id = ${photoId} and owner_id = ${uid} limit 1`) as unknown[]
          if (owns.length === 0) return Response.json({ error: 'photo not found' }, { status: 404 })
          const metas = JSON.parse((form.get('faces') as string) || '[]') as FaceMeta[]
          const crops = form.getAll('crops').filter((c): c is File => c instanceof File)
          for (let i = 0; i < metas.length; i++) {
            const meta = metas[i]!
            const crop = crops[i]
            if (!crop || !Array.isArray(meta.embedding) || meta.embedding.length !== 1024) continue
            const faceId = crypto.randomUUID()
            const cropKey = `faces/${faceId}.jpg`
            await putImage(cropKey, new Uint8Array(await crop.arrayBuffer()), 'image/jpeg')
            await sql`
              insert into faces (id, photo_id, owner_id, bbox, crop_key, score, embedding)
              values (${faceId}, ${photoId}, ${uid}, ${JSON.stringify(meta.bbox)}::jsonb, ${cropKey}, ${meta.score}, ${toVector(meta.embedding)}::vector)
            `
          }
          const people = await rebuildPeople(uid)
          return Response.json({ faces: metas.length, people })
        } catch (err) {
          if (err instanceof Unauthorized) return Response.json({ error: err.message }, { status: 401 })
          return Response.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 })
        }
      },
    },
  },
})
