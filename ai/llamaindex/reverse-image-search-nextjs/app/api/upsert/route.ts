export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import imageVectorStore from '@/lib/vectorStore'
import { ImageDocument, Settings, VectorStoreIndex } from 'llamaindex'
import { ClipEmbedding } from 'llamaindex/embeddings/ClipEmbedding'
import { v4 as uuidv4 } from 'uuid'

Settings.embedModel = new ClipEmbedding()

export async function POST(request: Request) {
  // Parse the form data from the request to get the file
  const data = await request.formData()
  const file = data.get('file') as File
  // If no file is provided, return a 400 Bad Request response
  if (!file) return new Response(null, { status: 400 })
  // Read the file contents into a buffer
  const fileBuffer = await file.arrayBuffer()
  // Create a Blob from the buffer with the correct MIME type
  const fileBlob = new Blob([fileBuffer], { type: file.type })
  const buffer = Buffer.from(fileBuffer)
  const base64String = buffer.toString('base64')
  const mimeType = file.type // Get the MIME type from the file
  const dataUrl = `data:${mimeType};base64,${base64String}`
  // Convert image URLs into ImageDocument objects
  const document = new ImageDocument({
    // Generate a unique ID for each image document
    id_: uuidv4(),
    // Convert imageURL to a URL object
    image: fileBlob,
    metadata: { url: dataUrl },
  })
  // Index the ImageDocument objects in the vector store
  await VectorStoreIndex.fromDocuments([document], { imageVectorStore })
  return new Response(null, { status: 200 })
}
