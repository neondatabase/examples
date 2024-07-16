export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import loadVectorStore from '@/lib/vectorStore'
import { ChatOllama } from '@langchain/community/chat_models/ollama'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import type { ChatPromptTemplate } from '@langchain/core/prompts'
import { ChatOpenAI } from '@langchain/openai'
import { type Message } from 'ai/react'
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents'
import { createRetrievalChain } from 'langchain/chains/retrieval'
import { pull } from 'langchain/hub'
import { NextRequest } from 'next/server'

const llm = process.env.OLLAMA_ENDPOINT
  ? new ChatOllama({
      model: 'llama3',
      baseUrl: process.env.OLLAMA_ENDPOINT,
    })
  : new ChatOpenAI()
const encoder = new TextEncoder()

export async function POST(request: NextRequest) {
  const vectorStore = await loadVectorStore()
  const { messages = [] } = (await request.json()) as { messages: Message[] }
  const userMessages = messages.filter((i) => i.role === 'user')
  const input = userMessages[userMessages.length - 1].content
  const retrievalQAChatPrompt = await pull<ChatPromptTemplate>('langchain-ai/retrieval-qa-chat')
  const retriever = vectorStore.asRetriever({ k: 10, searchType: 'similarity' })
  const combineDocsChain = await createStuffDocumentsChain({
    llm,
    prompt: retrievalQAChatPrompt,
  })
  const retrievalChain = await createRetrievalChain({
    retriever,
    combineDocsChain,
  })
  const customReadable = new ReadableStream({
    async start(controller) {
      const stream = await retrievalChain.stream({ input, chat_history: messages.map((i) => (i.role === 'user' ? new HumanMessage(i.content) : new AIMessage(i.content))) })
      for await (const chunk of stream) {
        controller.enqueue(encoder.encode(chunk.answer))
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
