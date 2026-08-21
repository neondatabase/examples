/**
 * Build the Lakebase ANN index over the photo embeddings.
 *
 * Run this *after* seeding: a lakebase_ann index over an empty table has no
 * rows to partition. `vector_cosine_ops` is what registers both `<=>` (top-k
 * ordering) and `<<=>>` (the indexed radius used for near-duplicate search).
 */
import { sql } from '../src/lib/db'

async function main() {
  const [{ count }] = (await sql`select count(*)::int as count from photos`) as { count: number }[]
  if (count === 0) throw new Error('no photos yet, run `npm run seed` first')
  console.log(`Building lakebase_ann over ${count} photos …`)

  await sql`drop index if exists photos_embedding_ann`
  await sql`
    create index photos_embedding_ann on photos
    using lakebase_ann (embedding vector_cosine_ops)
    with (build_mode = 'standard')
  `
  console.log('Index photos_embedding_ann ready.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
