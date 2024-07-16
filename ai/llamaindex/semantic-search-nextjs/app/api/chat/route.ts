export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import { NextRequest } from 'next/server'
import vectorStore from '@/lib/vectorStore'
import { NodeWithScore, Ollama, Settings, VectorStoreIndex } from 'llamaindex'

interface Message {
  role: 'user' | 'assistant' | 'system' | 'memory'
  content: string
}

if (process.env.OLLAMA_ENDPOINT) Settings.llm = new Ollama({ model: 'llama3', config: { host: process.env.OLLAMA_ENDPOINT } })

export async function POST(request: NextRequest) {
  const { messages = [] } = (await request.json()) as { messages: { role: 'user' | 'assistant' | 'system' | 'memory'; content: string }[] }
  const userMessages = messages.filter((i) => i.role === 'user')
  const query = userMessages[userMessages.length - 1].content
  const index = await VectorStoreIndex.fromVectorStore(vectorStore)
  const queryEngine = index.asQueryEngine()
  const { sourceNodes } = await queryEngine.query({
    query,
  })
  let response = "Here's all the metadata I found similar to your message:\n"
  if (sourceNodes) {
    sourceNodes.forEach((source: NodeWithScore) => {
      if (source.node.metadata.text) response += '- ' + source.node.metadata.text + '\n'
    })
  }
  return new Response(response)
}
