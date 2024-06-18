import { NeonPostgres } from '@langchain/community/vectorstores/neon'
import { OpenAIEmbeddings } from '@langchain/openai'

const embeddings = new OpenAIEmbeddings({
  dimensions: 512,
  model: "text-embedding-3-small"
})

export default async function loadVectorStore() {
  return await NeonPostgres.initialize(embeddings, {
    connectionString: process.env.POSTGRES_URL as string,
  })
}
