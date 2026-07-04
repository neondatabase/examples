import { neon } from '@neon/ai-sdk-provider';
import { streamText, type ModelMessage } from 'ai';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { getDb } from './db/client';
import { images } from './db/schema';

const db = getDb();

const s3 = new S3Client({
  forcePathStyle:
    (process.env.NEON_STORAGE_FORCE_PATH_STYLE ?? 'true').toLowerCase() !== 'false',
});

const BUCKET = 'images';
const MODEL = 'gpt-5-mini';

async function persistImage(prompt: string, jpegBase64: string) {
  const body = Buffer.from(jpegBase64, 'base64');
  const key = `generated/${randomUUID()}.jpg`;
  const contentType = 'image/jpeg';

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  console.log(`[persist] uploaded s3://${BUCKET}/${key} (${body.byteLength} bytes)`);

  const [row] = await db
    .insert(images)
    .values({ prompt, bucketKey: key, contentType, bytes: body.byteLength })
    .returning({ id: images.id });
  console.log(`[persist] inserted images.id=${row?.id}`);

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 3600 },
  );
  console.log(`[persist] view: ${url}`);

  return { id: row?.id, key, bytes: body.byteLength, url };
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return new Response('POST chat messages to this endpoint', { status: 405 });
    }

    const { messages } = (await request.json()) as { messages: ModelMessage[] };
    const prompt = lastUserText(messages);

    const result = streamText({
      model: neon(MODEL),
      system:
        'You are an illustration agent. When the user asks for a picture, use the ' +
        'image_generation tool to create it, then briefly tell the user what you drew.',
      messages,
      tools: {
        image_generation: neon.tools.imageGeneration({
          outputFormat: 'jpeg',
          quality: 'low',
          outputCompression: 30,
          size: '1024x1024',
        }),
      },
      onStepFinish({ toolResults }) {
        for (const tr of toolResults) {
          if (tr.toolName !== 'image_generation') continue;
          const base64 = imageResultBase64(tr.output);
          if (base64) {
            persistImage(prompt, base64).catch((err) =>
              console.error('[persist] failed:', err),
            );
          }
        }
      },
      onError({ error }) {
        console.error('[streamText] error:', error);
      },
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => (error instanceof Error ? error.message : String(error)),
    });
  },
};

function imageResultBase64(output: unknown): string | null {
  if (typeof output === 'object' && output !== null && 'result' in output) {
    const { result } = output;
    if (typeof result === 'string') return result;
  }
  return null;
}

function lastUserText(messages: ModelMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'user') continue;
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      const text = message.content
        .filter((part) => part.type === 'text')
        .map((part) => ('text' in part ? part.text : ''))
        .join(' ')
        .trim();
      if (text) return text;
    }
  }
  return 'generated image';
}
