import { PGVectorStore } from 'llamaindex/storage/vectorStore/PGVectorStore'

const vectorStore = new PGVectorStore({
  dimensions: 512,
  connectionString: process.env.POSTGRES_URL,
})

export default vectorStore
