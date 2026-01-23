export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import { neon } from '@neondatabase/serverless'
import { NextRequest } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export async function POST(request: NextRequest) {
  try {
    const { messages = [] } = (await request.json()) as { messages: Message[] }
    const userMessages = messages.filter((i) => i.role === 'user')
    const query = userMessages[userMessages.length - 1].content
    
    const sql = neon(process.env.DATABASE_URL!)
    const embeddingData = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    })
    const embeddingVector = embeddingData.data[0].embedding.slice(0, 512)
    const topK = 10
    
    const results = await sql`select content from hybrid_search(
    ${query},
    ${JSON.stringify(embeddingVector)}::vector(512),
    ${topK}
  );`
    
    let response = "Here's all the metadata I found similar to your message:\n"
    results.forEach(({ content }) => (response += '- ' + content + '\n'))
    
    // AI SDK 3 expects newline-delimited JSON format
    const encoder = new TextEncoder()
    const transformedStream = new ReadableStream({
      start(controller) {
        // Format: 0:"text content"\n
        const formatted = `0:${JSON.stringify(response)}\n`
        controller.enqueue(encoder.encode(formatted))
        controller.close()
      },
    })
    
    return new Response(transformedStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (error) {
    console.error('Error in chat route:', error)
    return new Response(JSON.stringify({ error: String(error) }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
