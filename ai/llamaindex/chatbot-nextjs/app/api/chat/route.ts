export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import { NextRequest } from 'next/server'
import vectorStore from '@/lib/vectorStore'
import { ContextChatEngine, Ollama, Settings, VectorStoreIndex } from 'llamaindex'

interface Message {
  role: 'user' | 'assistant' | 'system' | 'memory'
  content: string
}

if (process.env.OLLAMA_ENDPOINT) Settings.llm = new Ollama({ model: 'llama3', config: { host: process.env.OLLAMA_ENDPOINT } })

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()
  const { messages = [] } = (await request.json()) as { messages: Message[] }
  const userMessages = messages.filter((i) => i.role === 'user')
  const query = userMessages[userMessages.length - 1].content
  const index = await VectorStoreIndex.fromVectorStore(vectorStore)
  const retriever = index.asRetriever()
  const chatEngine = new ContextChatEngine({ retriever })
  const customReadable = new ReadableStream({
    async start(controller) {
      const stream = await chatEngine.chat({ message: query, chatHistory: messages, stream: true })
      for await (const chunk of stream) {
        controller.enqueue(encoder.encode(chunk.response))
      }
      controller.close()
    },
  })
  return new Response(customReadable, {
    headers: {
      Connection: 'keep-alive',
      'Content-Encoding': 'none',
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}
