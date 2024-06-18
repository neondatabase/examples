export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import loadVectorStore from '@/lib/vectorStore'
import { Document } from '@langchain/core/documents'

export async function POST(request: Request) {
  const { message: text } = await request.json()
  if (!text) return new Response(null, { status: 400 })
  const document = new Document({ pageContent: text })
  const vectorStore = await loadVectorStore()
  await vectorStore.addDocuments([document])
  return new Response()
}
