import { openai } from '@ai-sdk/openai';
import { streamText, tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { images } from './db/schema.ts';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const db = drizzle(pool);

const s3 = new S3Client({
  endpoint: process.env.NEON_BUCKETS_ENDPOINT || undefined,
  region: process.env.NEON_BUCKETS_REGION,
  credentials: {
    accessKeyId: process.env.NEON_BUCKETS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.NEON_BUCKETS_SECRET_ACCESS_KEY!,
  },
});

const bucket = process.env.NEON_BUCKETS_NAME ?? 'images';

const oai = new OpenAI();

async function persistImage(prompt: string, jpegBase64: string) {
  const body = Buffer.from(jpegBase64, 'base64');
  const key = `generated/${randomUUID()}.jpg`;
  const contentType = 'image/jpeg';

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  console.log(`[persistImage] uploaded s3://${bucket}/${key} (${body.byteLength} bytes)`);

  const [row] = await db
    .insert(images)
    .values({
      prompt,
      bucketKey: key,
      contentType,
      bytes: body.byteLength,
    })
    .returning({ id: images.id });
  console.log(`[persistImage] inserted images.id=${row?.id}`);

  const url = await presign(key);
  console.log(`[persistImage] view: ${url}`);

  return { id: row?.id, key, bytes: body.byteLength, url };
}

async function presign(key: string, expiresInSeconds = 3600) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

export default {
  port: 3000,
  idleTimeout: 120,
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return new Response('POST chat messages to this endpoint', { status: 405 });
    }

    const { messages } = (await request.json()) as { messages: ModelMessage[] };

    const result = streamText({
      model: openai('gpt-4o'),
      messages,
      tools: {
        generateImage: tool({
          description: 'Generate an image from a text prompt',
          inputSchema: z.object({ prompt: z.string() }),
          execute: async ({ prompt }) => {
            console.log(`[generateImage] prompt: ${prompt}`);
            const res = await oai.images.generate({
              model: 'gpt-image-1',
              prompt,
              size: '1024x1024',
              output_format: 'jpeg',
            });
            const b64 = res.data?.[0]?.b64_json;
            if (!b64) throw new Error('No image returned from OpenAI');
            return { prompt, image: b64 };
          },
        }),
      },
      onStepFinish({ toolResults }) {
        for (const tr of toolResults) {
          if (tr.toolName === 'generateImage') {
            const { prompt } = tr.input as { prompt: string };
            const { image } = tr.output as { image: string };
            persistImage(prompt, image).catch((err) =>
              console.error('[persistImage] failed:', err),
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
