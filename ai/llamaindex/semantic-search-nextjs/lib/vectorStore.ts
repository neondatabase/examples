import { OpenAIEmbedding, Settings } from 'llamaindex'
import { PGVectorStore } from 'llamaindex/storage/vectorStore/PGVectorStore'

Settings.embedModel = new OpenAIEmbedding({
  dimensions: 512,
  model: 'text-embedding-3-small',
})

const vectorStore = new PGVectorStore({
  dimensions: 512,
  connectionString: process.env.POSTGRES_URL,
})

export default vectorStore
