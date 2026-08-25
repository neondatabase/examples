import { and, eq, inArray } from 'drizzle-orm'
import { chineseWhispers, type FaceNode } from '@/lib/cluster'
import { db } from '@/lib/db'
import { faces, people } from '@/lib/schema'

/**
 * Group one owner's faces into people and persist the result.
 *
 * People rows are derived, so this rebuilds them from scratch each time the
 * owner's faces change (a seed run, or a new upload): cluster every face with
 * Chinese Whispers, then keep the clusters that hold at least MIN_FACES faces as
 * "people". Singletons stay unassigned, they are almost always a stray or a
 * bystander and would only clutter the row of circles.
 *
 * The same `db` client backs the seed script and the /api/faces route, so both
 * regroup identically. Callers are responsible for scoping to a verified owner.
 */
const MIN_FACES = 2
// Cosine-similarity cutoff for linking two faces. Tuned by eye against the demo
// faceres embeddings: random (mostly different-person) pairs sit around 0.3-0.45,
// and only at 0.72 do the clusters come out as one real person each. Lower and
// Chinese Whispers chains similar-looking people (a bearded conference crowd) into
// one blob. Higher and a single person starts splitting across circles.
const THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD ?? 0.72)

export async function rebuildPeople(ownerId: string): Promise<number> {
  const rows = await db
    .select({ id: faces.id, crop_key: faces.cropKey, score: faces.score, embedding: faces.embedding, created_at: faces.createdAt })
    .from(faces)
    .where(eq(faces.ownerId, ownerId))

  // Start clean: detach every face, then drop the old clusters. ON DELETE SET
  // NULL would cover the detach, doing it first just keeps the FK quiet.
  await db.update(faces).set({ personId: null }).where(eq(faces.ownerId, ownerId))
  await db.delete(people).where(eq(people.ownerId, ownerId))
  if (rows.length === 0) return 0
  const nodes: FaceNode[] = rows.map((r) => ({ id: r.id, embedding: JSON.parse(r.embedding) as number[] }))
  const byId = new Map(rows.map((r) => [r.id, r]))
  const labels = chineseWhispers(nodes, THRESHOLD)
  const clusters = new Map<string, string[]>()
  for (const [faceId, cluster] of labels) {
    const list = clusters.get(cluster) ?? []
    list.push(faceId)
    clusters.set(cluster, list)
  }
  // Biggest groups first, so "Person 1" is the most-photographed face.
  const kept = [...clusters.values()].filter((ids) => ids.length >= MIN_FACES).sort((a, b) => b.length - a.length)
  let peopleCount = 0
  for (const faceIds of kept) {
    const members = faceIds.map((id) => byId.get(id)!)
    // The clearest, most confident face becomes the circle for this person.
    const cover = [...members].sort((a, b) => b.score - a.score)[0]!
    // Recency of the person = its newest face, so the UI can surface freshly
    // photographed people first.
    const lastFaceAt = members.reduce((max, m) => (m.created_at > max ? m.created_at : max), members[0]!.created_at)
    const personId = crypto.randomUUID()
    await db.insert(people).values({ id: personId, ownerId, coverKey: cover.crop_key, faceCount: faceIds.length, lastFaceAt })
    await db
      .update(faces)
      .set({ personId })
      .where(and(eq(faces.ownerId, ownerId), inArray(faces.id, faceIds)))
    peopleCount++
  }
  return peopleCount
}
