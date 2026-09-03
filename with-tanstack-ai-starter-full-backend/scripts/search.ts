/**
 * CLI search: proves the retrieval path end to end.
 *
 *   npm run search -- "people laughing together"      # text -> image
 *   npm run search -- --photo <id>              # image -> image (near neighbours)
 *
 * Text and image both become a 512-d CLIP vector, so the SQL is identical:
 * `order by embedding <=> $1`. That is the whole point of CLIP's shared space.
 */
import { sql } from 'drizzle-orm'
import { embedText } from '../src/lib/clip'
import { db, toVector } from '../src/lib/db'
import { imageUrl } from '../src/lib/storage'

type Hit = { id: string; filename: string; caption: string; distance: number }

async function queryVectorFromText(text: string): Promise<string> {
  const t = performance.now()
  const embedding = await embedText(text)
  console.log(`  embedded query in ${Math.round(performance.now() - t)}ms`)
  return toVector(embedding)
}

async function main() {
  const args = process.argv.slice(2)
  const photoFlag = args.indexOf('--photo')
  const limit = 8

  let hits: Hit[]
  let tq: number

  if (photoFlag !== -1) {
    const id = args[photoFlag + 1]
    if (!id) throw new Error('usage: npm run search -- --photo <id>')
    console.log(`Nearest neighbours of photo ${id}:`)
    tq = performance.now()
    hits = (
      await db.execute(sql`
        select p.id, p.filename, p.caption,
               p.embedding <=> (select embedding from photos where id = ${id}) as distance
        from photos p
        where p.id <> ${id}
        order by p.embedding <=> (select embedding from photos where id = ${id})
        limit ${limit}
      `)
    ).rows as Hit[]
  } else {
    const text = args.filter((a) => !a.startsWith('--')).join(' ')
    if (!text) throw new Error('usage: npm run search -- "a text query"')
    console.log(`Query: "${text}"`)
    const qvec = await queryVectorFromText(text)
    tq = performance.now()
    hits = (
      await db.execute(sql`
        select id, filename, caption, embedding <=> ${qvec}::vector as distance
        from photos
        order by embedding <=> ${qvec}::vector
        limit ${limit}
      `)
    ).rows as Hit[]
  }

  console.log(`  lakebase_ann query in ${Math.round(performance.now() - tq)}ms\n`)
  let rank = 1
  for (const h of hits) {
    const url = await imageUrl(h.filename)
    console.log(`  ${rank++}. ${Number(h.distance).toFixed(3)}  ${h.id}  "${h.caption}"`)
    console.log(`     ${url.slice(0, 100)}…`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
