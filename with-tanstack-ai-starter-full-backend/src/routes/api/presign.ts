import { createFileRoute } from '@tanstack/react-router'
import { sql } from '@/lib/db'
import { imageUrl } from '@/lib/storage'
import { requireUser, Unauthorized } from '@/lib/verify'

/**
 * POST /api/presign  { filenames?, faceKeys? }  ->  { urls: { [key]: url } }
 *
 * The Data API hands the browser photo and people *metadata* (RLS-scoped), but
 * presigning needs the storage secret, so it happens here. We re-check ownership
 * against the verified user before signing anything, a caller can only ever get
 * URLs for photos and face crops they own, even though this route runs on the
 * owner connection. `filenames` are photo keys, `faceKeys` are person-circle crops.
 */
export const Route = createFileRoute('/api/presign')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const uid = await requireUser(request)
          const { filenames, faceKeys } = (await request.json()) as { filenames?: string[]; faceKeys?: string[] }
          const keys: string[] = []
          if (Array.isArray(filenames) && filenames.length) {
            const owned = (await sql`select filename from photos where owner_id = ${uid} and filename = any(${filenames})`) as { filename: string }[]
            keys.push(...owned.map((r) => r.filename))
          }
          if (Array.isArray(faceKeys) && faceKeys.length) {
            const owned = (await sql`select crop_key from faces where owner_id = ${uid} and crop_key = any(${faceKeys})`) as { crop_key: string }[]
            keys.push(...owned.map((r) => r.crop_key))
          }
          if (keys.length === 0) return Response.json({ urls: {} })
          const entries = await Promise.all(keys.map(async (k) => [k, await imageUrl(k)] as const))
          return Response.json({ urls: Object.fromEntries(entries) })
        } catch (err) {
          if (err instanceof Unauthorized) return Response.json({ error: err.message }, { status: 401 })
          return Response.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 })
        }
      },
    },
  },
})
