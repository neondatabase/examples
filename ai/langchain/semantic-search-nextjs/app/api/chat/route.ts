export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import loadVectorStore from '@/lib/vectorStore'
import { type Message } from 'ai/react'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const vectorStore = await loadVectorStore()
  const { messages = [] } = (await request.json()) as { messages: Message[] }
  const userMessages = messages.filter((i) => i.role === 'user')
  const input = userMessages[userMessages.length - 1].content
  let response = "Here's all the metadata I found similar to your message:\n"
  const results = await vectorStore.similaritySearchWithScore(input, 3)
  results.forEach(source => {
    response += '- ' + source[0].pageContent + '\n'
  })
  return new Response(response)
}
