export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import { embedding } from 'litellm'
import { neon } from '@neondatabase/serverless'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const { messages = [] } = (await request.json()) as { messages: { role: 'user' | 'assistant' | 'system' | 'memory'; content: string }[] }
  const userMessages = messages.filter((i) => i.role === 'user')
  const input = userMessages[userMessages.length - 1].content
  const queryFunction = neon(`${process.env.POSTGRES_URL}`)
  const embeddingData = await embedding({
    model: 'text-embedding-3-small',
    input,
  })
  const embeddingVector = embeddingData.data[0].embedding.slice(0, 512)
  const topK = 10
  const results = await queryFunction(`select content from hybrid_search(
  '${input}',
  '[${embeddingVector}]'::vector(512),
  ${topK}
);`)
  let response = "Here's all the metadata I found similar to your message:\n"
  results.forEach(({ content }) => (response += '- ' + content + '\n'))
  return new Response(response)
}
