export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import vectorStore from '@/lib/vectorStore'
import { ClipEmbedding } from 'llamaindex/embeddings/ClipEmbedding'
import { VectorStoreQueryMode } from 'llamaindex/storage/vectorStore/types'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  // Parse the form data from the request to get the file
  const data = await request.formData()
  const file = data.get('file') as File
  // If no file is provided, return a 400 Bad Request response
  if (!file) return new Response(null, { status: 400 })
  // Read the file contents into a buffer
  const fileBuffer = await file.arrayBuffer()
  // Create a Blob from the buffer with the correct MIME type
  const fileBlob = new Blob([fileBuffer], { type: file.type })
  // Get the image embedding using ClipEmbedding
  const image_embedding = await new ClipEmbedding().getImageEmbedding(fileBlob)
  // Query the Neon Postgres vector store for similar images
  const { similarities, nodes } = await vectorStore.query({
    similarityTopK: 100,
    queryEmbedding: image_embedding,
    mode: VectorStoreQueryMode.DEFAULT,
  })
  // Initialize an array to store relevant image URLs
  const relevantImages: string[] = []
  if (nodes) {
    similarities.forEach((similarity: number, index: number) => {
      // Check if similarity is greater than 90% (i.e., similarity threshold)
      if (100 - similarity > 90) {
        const document = nodes[index]
        relevantImages.push(document.metadata.url)
      }
    })
  }
  return NextResponse.json(relevantImages)
}
