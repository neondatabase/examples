export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import { storageContextFromDefaults, VectorStoreIndex } from 'llamaindex'
import { PDFReader } from 'llamaindex/readers/PDFReader'
import vectorStore from '@/lib/vectorStore'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  // Parse the form data from the request to get the file
  const data = await request.formData()
  const file = data.get('file') as File
  // If no file is provided, return a 400 Bad Request response
  if (!file) return new Response(null, { status: 400 })
  // Read the file contents into a buffer
  const fileBuffer = await file.arrayBuffer()
  const documents = await new PDFReader().loadDataAsContent(new Uint8Array(fileBuffer))
  const storageContext = await storageContextFromDefaults({ vectorStore })
  await VectorStoreIndex.fromDocuments(documents, { storageContext })
  return new Response()
}
