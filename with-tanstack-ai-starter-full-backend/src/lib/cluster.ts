/**
 * Chinese Whispers clustering for face grouping.
 *
 * The number of people in a library is not known ahead of time, so k-means and
 * friends do not fit. Chinese Whispers is the graph algorithm dlib uses for
 * exactly this: build a graph where an edge joins two faces whose descriptors are
 * similar enough, then let labels propagate until they settle. Whatever clusters
 * exist fall out on their own, and a one-off face just stays in its own group.
 *
 * Input embeddings are assumed L2-normalized, so a dot product is cosine
 * similarity. No dependencies, so the seed script and the /api/faces route share it.
 */

export type FaceNode = { id: string; embedding: number[] }

function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!
  return s
}

/**
 * Group faces into clusters. Two faces are linked when their cosine similarity is
 * at least `threshold` (callers pass the tuned value from src/lib/faces-db, higher
 * is stricter). Returns a map from face id to a cluster id ("cluster-N").
 */
export function chineseWhispers(nodes: FaceNode[], threshold = 0.72, iterations = 20): Map<string, string> {
  const n = nodes.length
  const labels = new Array<number>(n)
  for (let i = 0; i < n; i++) labels[i] = i

  // Precompute the edges once: an undirected list of neighbours with weights.
  // O(n^2) in the number of faces, which is fine for the hundreds a demo holds.
  const neighbours: { j: number; w: number }[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const w = dot(nodes[i]!.embedding, nodes[j]!.embedding)
      if (w >= threshold) {
        neighbours[i]!.push({ j, w })
        neighbours[j]!.push({ j: i, w })
      }
    }
  }

  // Each pass, in random order, moves every node to whichever label carries the
  // most edge weight among its neighbours. Randomising the order is what lets
  // labels spread instead of locking into place.
  const order = Array.from({ length: n }, (_, i) => i)
  for (let pass = 0; pass < iterations; pass++) {
    for (let k = order.length - 1; k > 0; k--) {
      const r = Math.floor(Math.random() * (k + 1))
      ;[order[k], order[r]] = [order[r]!, order[k]!]
    }
    let moved = false
    for (const i of order) {
      const tally = new Map<number, number>()
      for (const { j, w } of neighbours[i]!) {
        tally.set(labels[j]!, (tally.get(labels[j]!) ?? 0) + w)
      }
      if (tally.size === 0) continue
      let best = labels[i]!
      let bestW = -Infinity
      for (const [label, w] of tally) {
        if (w > bestW) {
          bestW = w
          best = label
        }
      }
      if (best !== labels[i]!) {
        labels[i] = best
        moved = true
      }
    }
    if (!moved) break
  }

  // Renumber the surviving labels to compact, stable cluster ids.
  const canonical = new Map<number, string>()
  const out = new Map<string, string>()
  for (let i = 0; i < n; i++) {
    const label = labels[i]!
    let id = canonical.get(label)
    if (!id) {
      id = `cluster-${canonical.size}`
      canonical.set(label, id)
    }
    out.set(nodes[i]!.id, id)
  }
  return out
}
