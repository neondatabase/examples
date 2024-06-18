export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import { NextRequest } from 'next/server'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import loadVectorStore from '@/lib/vectorStore'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

export async function POST(request: NextRequest) {
  // Parse the form data from the request to get the file
  const data = await request.formData()
  const file = data.get('file') as File
  // If no file is provided, return a 400 Bad Request response
  if (!file) return new Response(null, { status: 400 })
  // Read the file contents into a buffer
  const arrayBuffer = await file.arrayBuffer()
  const fileBlob = new Blob([arrayBuffer], { type: file.type })
  const loader = new PDFLoader(fileBlob)
  const docs = await loader.load()
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  })
  const splitDocs = await textSplitter.splitDocuments(docs)
  const vectorStore = await loadVectorStore()
  await vectorStore.addDocuments(splitDocs)
  return new Response()
}
