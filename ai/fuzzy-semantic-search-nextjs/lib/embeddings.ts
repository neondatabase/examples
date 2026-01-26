import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'

// Cache the pipeline to avoid reloading the model on every request
let extractor: FeatureExtractionPipeline | null = null

/**
 * Get or create the embedding pipeline.
 * Uses Xenova/gte-small (384 dimensions, MTEB score 61.4)
 */
export async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    console.log('Loading embedding model (Xenova/gte-small)...')
    extractor = await pipeline('feature-extraction', 'Xenova/gte-small', {
      // Use quantized model for faster inference
      dtype: 'q8',
    })
    console.log('Embedding model loaded.')
  }
  return extractor
}

/**
 * Generate an embedding for a single text.
 * Returns a 384-dimensional vector.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline()
  const output = await pipe(text, { pooling: 'mean', normalize: true })
  // Convert Tensor to array
  return Array.from(output.data as Float32Array)
}

/**
 * Generate embeddings for multiple texts in batch.
 * More efficient than calling generateEmbedding multiple times.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const pipe = await getEmbeddingPipeline()
  const results: number[][] = []
  
  // Process in batches to avoid memory issues
  const batchSize = 32
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const outputs = await Promise.all(
      batch.map(async (text) => {
        const output = await pipe(text, { pooling: 'mean', normalize: true })
        return Array.from(output.data as Float32Array)
      })
    )
    results.push(...outputs)
  }
  
  return results
}
