import { createFileRoute } from '@tanstack/react-router'
import { sql, toVector } from '@/lib/db'
import { requireUser, Unauthorized } from '@/lib/verify'

/**
 * POST /api/face-search  { embedding }  ->  { results }
 *
 * Identity search: rank the caller's photos by how close their nearest face is to
 * a query face descriptor (detected in the browser from a dropped photo, see
 * src/lib/faces-client). This is the face analog of the CLIP image search, over
 * the faces table instead of photos.embedding.
 *
 * It runs the vector query directly on the owner connection, scoped to the
 * verified owner_id (never a client-supplied id), rather than through a Data API
 * RPC. Face grouping reads still go through the Data API under RLS. Ranking lives
 * here so it is immediately consistent and never waits on a PostgREST schema
 * reload, and it mirrors the other compute routes (embed / upload / faces).
 */
export const Route = createFileRoute('/api/face-search')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const uid = await requireUser(request)
          const { embedding } = (await request.json()) as { embedding?: number[] }
          if (!Array.isArray(embedding) || embedding.length !== 1024) return Response.json({ error: 'expected a 1024-d face embedding' }, { status: 400 })
          const results = await sql`
            select p.id, p.filename, p.caption, p.width, p.height,
                   min(f.embedding <=> ${toVector(embedding)}::vector) as distance
            from photos p
            join faces f on f.photo_id = p.id
            where p.owner_id = ${uid} and f.owner_id = ${uid}
            group by p.id, p.filename, p.caption, p.width, p.height
            order by distance
            limit 48
          `
          return Response.json({ results })
        } catch (err) {
          if (err instanceof Unauthorized) return Response.json({ error: err.message }, { status: 401 })
          return Response.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 })
        }
      },
    },
  },
})
