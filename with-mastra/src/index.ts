import { personalAssistant } from './agent';

type ChatRequest = {
  // OpenAI/AI-SDK-style chat messages, e.g. [{ role: 'user', content: 'hi' }].
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  // Stable identifier for the user. Working memory is scoped to this, so reusing it
  // across requests is what lets the assistant remember you between conversations.
  resourceId?: string;
  // Conversation thread. Reuse it to continue a conversation; use a new id to start fresh.
  threadId?: string;
};

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return new Response('POST chat messages to this endpoint', { status: 405 });
    }

    const { messages, resourceId, threadId } = (await request.json()) as ChatRequest;
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response('Body must be { messages: [{ role, content }, ...] }', {
        status: 400,
      });
    }

    const stream = await personalAssistant.stream(messages, {
      memory: {
        resource: resourceId ?? 'demo-user',
        thread: threadId ?? 'demo-thread',
      },
    });

    // Stream the assistant's reply back as plain text. Memory reads/writes (history +
    // working-memory updates) happen automatically inside the agent run.
    return new Response(stream.textStream.pipeThrough(new TextEncoderStream()), {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};
