/**
 * Generate a caption for every photo that lacks one, using the self-hosted
 * image-to-text model (ViT-GPT2 via transformers.js, the same captioner the
 * upload route uses). Re-runnable: only fills in empty captions.
 *
 *   npm run caption          # caption all photos missing a caption
 *   npm run caption -- 5     # just the first 5 (for a quick check)
 */
import { captionImageBytes } from '../src/lib/caption'
import { sql } from '../src/lib/db'
import { imageUrl } from '../src/lib/storage'

const LIMIT = process.argv[2] ? Number(process.argv[2]) : Infinity

async function main() {
  const all = (await sql`select id, filename from photos where caption is null or caption = '' order by filename`) as { id: string; filename: string }[]
  const rows = all.slice(0, LIMIT)
  console.log(`Captioning ${rows.length} photos (of ${all.length} missing) …`)

  let done = 0
  for (const r of rows) {
    try {
      const bytes = new Uint8Array(await (await fetch(await imageUrl(r.filename))).arrayBuffer())
      const caption = await captionImageBytes(bytes)
      await sql`update photos set caption = ${caption} where id = ${r.id}`
      done++
      if (done % 10 === 0 || done === 1) process.stdout.write(`  [${done}/${rows.length}] ${r.filename}: "${caption}"\n`)
    } catch (err) {
      console.warn(`  skip ${r.filename}: ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(`Done. Captioned ${done}.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
