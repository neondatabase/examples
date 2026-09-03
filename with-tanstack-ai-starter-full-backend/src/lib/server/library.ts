import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db, toVector } from '@/lib/db'
import { faces, people, photos } from '@/lib/schema'
import { imageUrl } from '@/lib/storage'
import { authMiddleware } from './auth'

/**
 * The read/query "control plane" for the library, as JWT-checked server functions.
 *
 * This is what replaced the Neon Data API: instead of the browser querying Postgres
 * directly under RLS, it calls these functions, which run on the server, verify the
 * user (authMiddleware -> context.userId), and scope every query to that owner in
 * SQL. They also presign the storage URLs before returning, so the client gets
 * ready-to-render cards in one round trip (no separate /api/presign step).
 *
 * pgvector ranking (`<=>`) isn't expressible in Drizzle's query builder, so those
 * queries use a raw `sql` fragment via `db.execute`; the rest use the query builder.
 */
export type Card = { id: string; filename: string; url?: string; caption: string; distance: number; width: number; height: number }
export type Person = { id: string; label: string | null; cover_key: string | null; cover_url?: string; face_count: number }

async function withUrls(rows: Card[]): Promise<Card[]> {
  return Promise.all(rows.map(async (r) => ({ ...r, url: await imageUrl(r.filename) })))
}

// Shape a raw ranking row (numbers can arrive as strings over HTTP) into a Card.
function toCard(r: Record<string, unknown>): Card {
  return {
    id: String(r.id),
    filename: String(r.filename),
    caption: (r.caption as string) ?? '',
    width: Number(r.width) || 0,
    height: Number(r.height) || 0,
    distance: Number(r.distance) || 0,
  }
}

/** Recent photos (newest first) with an exact total, for the library grid. */
export const listPhotos = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: { offset: number; limit: number }) => d)
  .handler(async ({ data, context }): Promise<{ cards: Card[]; total: number }> => {
    const uid = context.userId
    const rows = await db
      .select({ id: photos.id, filename: photos.filename, caption: photos.caption, width: photos.width, height: photos.height })
      .from(photos)
      .where(eq(photos.ownerId, uid))
      .orderBy(desc(photos.createdAt))
      .limit(data.limit)
      .offset(data.offset)
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(photos)
      .where(eq(photos.ownerId, uid))
    const cards = rows.map((r) => ({ ...r, caption: r.caption ?? '', distance: 0 }))
    return { cards: await withUrls(cards), total: count }
  })

/** Rank the owner's photos by cosine distance to a CLIP query vector (text or image). */
export const searchPhotos = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: { embedding: number[]; limit?: number }) => d)
  .handler(async ({ data, context }): Promise<Card[]> => {
    const uid = context.userId
    const q = toVector(data.embedding)
    const limit = data.limit ?? 48
    const { rows } = await db.execute(sql`
      select id, filename, caption, width, height, (embedding <=> ${q}::vector) as distance
      from photos
      where owner_id = ${uid}
      order by embedding <=> ${q}::vector
      limit ${limit}
    `)
    return withUrls((rows as Record<string, unknown>[]).map(toCard))
  })

/** Find-similar: the owner's other photos nearest to one of their photos. */
export const neighbors = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: { photoId: string; limit?: number }) => d)
  .handler(async ({ data, context }): Promise<{ source: { url: string } | null; cards: Card[] }> => {
    const uid = context.userId
    const limit = data.limit ?? 48
    // The photo we're finding neighbours of, so the client can show it as the
    // "searching with" thumbnail (it's excluded from the ranked results below).
    const [src] = await db
      .select({ filename: photos.filename })
      .from(photos)
      .where(and(eq(photos.id, data.photoId), eq(photos.ownerId, uid)))
      .limit(1)
    if (!src) return { source: null, cards: [] }
    const { rows } = await db.execute(sql`
      select p.id, p.filename, p.caption, p.width, p.height, (p.embedding <=> q.embedding) as distance
      from photos p, (select embedding from photos where id = ${data.photoId} and owner_id = ${uid}) q
      where p.owner_id = ${uid} and p.id <> ${data.photoId}
      order by p.embedding <=> q.embedding
      limit ${limit}
    `)
    return { source: { url: await imageUrl(src.filename) }, cards: await withUrls((rows as Record<string, unknown>[]).map(toCard)) }
  })

/** Every photo containing a face in one person's cluster (newest first). */
export const personPhotos = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: { personId: string; limit?: number }) => d)
  .handler(async ({ data, context }): Promise<Card[]> => {
    const uid = context.userId
    const rows = await db
      .selectDistinct({ id: photos.id, filename: photos.filename, caption: photos.caption, width: photos.width, height: photos.height, createdAt: photos.createdAt })
      .from(photos)
      .innerJoin(faces, eq(faces.photoId, photos.id))
      .where(and(eq(photos.ownerId, uid), eq(faces.ownerId, uid), eq(faces.personId, data.personId)))
      .orderBy(desc(photos.createdAt))
      .limit(data.limit ?? 200)
    const cards = rows.map((r) => ({ id: r.id, filename: r.filename, caption: r.caption ?? '', width: r.width, height: r.height, distance: 0 }))
    return withUrls(cards)
  })

/** Identity search: rank the owner's photos by nearest face to a query descriptor. */
export const faceSearch = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: { embedding: number[]; limit?: number }) => d)
  .handler(async ({ data, context }): Promise<Card[]> => {
    const uid = context.userId
    if (!Array.isArray(data.embedding) || data.embedding.length !== 1024) throw new Error('expected a 1024-d face embedding')
    const q = toVector(data.embedding)
    const limit = data.limit ?? 48
    const { rows } = await db.execute(sql`
      select p.id, p.filename, p.caption, p.width, p.height, min(f.embedding <=> ${q}::vector) as distance
      from photos p
      join faces f on f.photo_id = p.id
      where p.owner_id = ${uid} and f.owner_id = ${uid}
      group by p.id, p.filename, p.caption, p.width, p.height
      order by distance
      limit ${limit}
    `)
    return withUrls((rows as Record<string, unknown>[]).map(toCard))
  })

/** A page of face groups (circles), most recently photographed first, with an exact total. */
export const listPeople = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: { offset: number; limit: number }) => d)
  .handler(async ({ data, context }): Promise<{ people: Person[]; total: number }> => {
    const uid = context.userId
    const rows = await db
      .select({ id: people.id, label: people.label, cover_key: people.coverKey, face_count: people.faceCount })
      .from(people)
      .where(eq(people.ownerId, uid))
      .orderBy(desc(people.lastFaceAt), people.id)
      .limit(data.limit)
      .offset(data.offset)
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(people)
      .where(eq(people.ownerId, uid))
    const withCovers = await Promise.all(rows.map(async (p) => ({ ...p, cover_url: p.cover_key ? await imageUrl(p.cover_key) : undefined })))
    return { people: withCovers, total: count }
  })
