export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import { BedrockRuntimeClient, ConversationRole, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const accessKeyId = process.env.AWS_KEY_ID
const secretAccessKey = process.env.AWS_SECRET_KEY

export async function POST(request: Request) {
  if (!accessKeyId || !secretAccessKey) return new Response(null, { status: 500 })
  const { messages = [] }: { messages: ChatMessage[] } = await request.json()
  const client = new BedrockRuntimeClient({
    region: 'us-east-1',
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })
  const apiResponse = await client.send(
    new ConverseCommand({
      modelId: 'amazon.titan-text-express-v1',
      messages: messages.map((i: { content: string; role: string }) => ({
        role: i.role === 'user' ? ConversationRole.USER : ConversationRole.ASSISTANT,
        content: [{ text: i.role === 'user' ? `Always remember to take all the messages exchanged into account before generating a response.\n${i.content}` : i.content }],
      })),
    }),
  )
  return new Response(apiResponse.output?.message?.content?.at(-1)?.text)
}
