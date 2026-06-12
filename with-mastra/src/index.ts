import { personalAssistant } from './agent';

type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string };
type ChatRequest = { messages: ChatMessage[]; resourceId?: string; threadId?: string };

function isChatMessage(value: unknown): value is ChatMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'role' in value &&
    'content' in value &&
    (value.role === 'user' || value.role === 'assistant' || value.role === 'system') &&
    typeof value.content === 'string'
  );
}

function isChatRequest(value: unknown): value is ChatRequest {
  if (typeof value !== 'object' || value === null || !('messages' in value)) return false;
  if (!Array.isArray(value.messages) || value.messages.length === 0) return false;
  if (!value.messages.every(isChatMessage)) return false;
  if ('resourceId' in value && value.resourceId !== undefined && typeof value.resourceId !== 'string') {
    return false;
  }
  if ('threadId' in value && value.threadId !== undefined && typeof value.threadId !== 'string') {
    return false;
  }
  return true;
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return new Response('POST chat messages to this endpoint', { status: 405 });
    }

    const body: unknown = await request.json();
    if (!isChatRequest(body)) {
      return new Response('Body must be { messages: [{ role, content }, ...] }', { status: 400 });
    }

    const stream = await personalAssistant.stream(body.messages, {
      memory: {
        resource: body.resourceId ?? 'demo-user',
        thread: body.threadId ?? 'demo-thread',
      },
    });

    return new Response(stream.textStream.pipeThrough(new TextEncoderStream()), {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};
