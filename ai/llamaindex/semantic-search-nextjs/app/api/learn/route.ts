export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import vectorStore from '@/lib/vectorStore'
import { Document, VectorStoreIndex, storageContextFromDefaults } from 'llamaindex'

export async function POST(request: Request) {
  const { message: text } = await request.json()
  if (!text) return new Response(null, { status: 400 })
  const storageContext = await storageContextFromDefaults({ vectorStore })
  const document = new Document({ text, metadata: { text } })
  await VectorStoreIndex.fromDocuments([document], { storageContext })
  return new Response()
}
