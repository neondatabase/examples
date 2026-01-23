export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import { NextRequest } from 'next/server'
import vectorStore from '@/lib/vectorStore'
import { ContextChatEngine, Settings, VectorStoreIndex } from 'llamaindex'
import { OpenAI } from '@llamaindex/openai'
import { Ollama } from '@llamaindex/ollama'
import { streamText } from 'ai'

interface Message {
  role: 'user' | 'assistant' | 'system' | 'memory'
  content: string
}

// Set default LLM (required in LlamaIndex 0.12+)
Settings.llm = new OpenAI({ model: 'gpt-4o-mini' })

// Override with Ollama if endpoint is configured
if (process.env.OLLAMA_ENDPOINT) {
  Settings.llm = new Ollama({ model: 'llama3', config: { host: process.env.OLLAMA_ENDPOINT } })
}

export async function POST(request: NextRequest) {
  const { messages = [] } = (await request.json()) as { messages: Message[] }
  const userMessages = messages.filter((i) => i.role === 'user')
  const query = userMessages[userMessages.length - 1].content
  
  const index = await VectorStoreIndex.fromVectorStore(vectorStore)
  const retriever = index.asRetriever()
  const chatEngine = new ContextChatEngine({ retriever })
  
  // Use Vercel AI SDK's expected format for streaming
  const stream = await chatEngine.chat({ message: query, chatHistory: messages, stream: true })
  
  // Convert LlamaIndex stream to AI SDK v3 format
  const encoder = new TextEncoder()
  const transformedStream = new ReadableStream({
    async start(controller) {
      // AI SDK expects newline-delimited JSON with specific format
      for await (const chunk of stream) {
        const text = chunk.delta || ''
        if (text) {
          // Format: 0:"text content"\n
          const formatted = `0:${JSON.stringify(text)}\n`
          controller.enqueue(encoder.encode(formatted))
        }
      }
      controller.close()
    },
  })
  
  return new Response(transformedStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  })
}
