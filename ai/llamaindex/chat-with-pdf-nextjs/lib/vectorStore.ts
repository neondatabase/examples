import { PGVectorStore } from 'llamaindex/storage/vectorStore/PGVectorStore'

const vectorStore = new PGVectorStore({
  dimensions: 1536,
  connectionString: process.env.POSTGRES_URL,
})

export default vectorStore
