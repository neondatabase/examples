import { OpenAIEmbedding } from '@llamaindex/openai'
import { PGVectorStore } from '@llamaindex/postgres'
import { Settings } from 'llamaindex'

Settings.embedModel = new OpenAIEmbedding({
  dimensions: 512,
  model: 'text-embedding-3-small',
})

const vectorStore = new PGVectorStore({
  dimensions: 512,
  clientConfig: {
    connectionString: process.env.DATABASE_URL,
  },
})

export default vectorStore
