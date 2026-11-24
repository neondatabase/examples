import { neon } from '@neon/ai-sdk-provider';
import { generateText } from 'ai';
import { persistImage } from './persist';

const MODEL = 'gemini-3-1-flash-image';

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return new Response('POST {"prompt": "..."} to this endpoint', { status: 405 });
    }

    const body: unknown = await request.json().catch(() => undefined);
    const prompt =
      typeof body === 'object' && body !== null && 'prompt' in body ? body.prompt : undefined;
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return Response.json(
        { error: 'Send a JSON body with a non-empty "prompt" string' },
        { status: 400 },
      );
    }

    const { files, text, usage } = await generateText({ model: neon(MODEL), prompt });
    const generated = files.filter((file) => file.mediaType.startsWith('image/'));
    if (generated.length === 0) {
      return Response.json({ error: `${MODEL} returned no image`, text }, { status: 502 });
    }

    const saved = await Promise.all(
      generated.map((file) => persistImage(prompt, file.uint8Array, file.mediaType)),
    );
    return Response.json({ images: saved, text, imageTokens: usage.raw?.image_output_tokens });
  },
};
