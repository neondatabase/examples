import { openai } from '@ai-sdk/openai';
import { streamText, type ModelMessage } from 'ai';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { parseEnv } from '@neondatabase/env/v1';
import config from '../neon';
import { images } from './db/schema';

// Typesafe, validated env. `neon dev` (and `neon env pull`) inject the branch's
// DATABASE_URL here; throws a clear error if it isn't present.
const env = parseEnv(config);

const pool = new Pool({ connectionString: env.postgres.databaseUrl, max: 5 });
const db = drizzle(pool);

// The branch's object-storage credential is injected as the AWS SDK's standard env vars
// (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_ENDPOINT_URL_S3 / AWS_REGION), so the
// client only needs path-style addressing turned on for Neon object storage.
const s3 = new S3Client({
  forcePathStyle:
    (process.env.NEON_STORAGE_FORCE_PATH_STYLE ?? 'true').toLowerCase() !== 'false',
});

// Bucket name, as declared in neon.ts (`preview.buckets`).
const BUCKET = 'images';

// An OpenAI/GPT-5 model served by the Neon AI Gateway (OpenAI Responses dialect). The
// built-in `image_generation` tool requires a GPT-5 model. OPENAI_API_KEY / OPENAI_BASE_URL
// are injected by `neon dev`, so `openai()` targets the branch gateway with no extra wiring.
const MODEL = 'databricks-gpt-5-mini';

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
      model: openai(MODEL),
      system:
        'You are an illustration agent. When the user asks for a picture, use the ' +
        'image_generation tool to create it, then briefly tell the user what you drew.',
      messages,
      tools: {
        // The Neon AI Gateway exposes OpenAI image generation as the Responses API's
        // built-in `image_generation` tool (there is no separate images endpoint). It runs
        // server-side in a single call and returns the image inline as base64. We ask for a
        // compressed JPEG to stay under the gateway's per-response size cap.
        image_generation: openai.tools.imageGeneration({
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
            // Fire-and-forget so a storage/DB hiccup never tears down the response stream.
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

/** The base64 image out of an `image_generation` tool result (`{ result: string }`). */
function imageResultBase64(output: unknown): string | null {
  if (typeof output === 'object' && output !== null && 'result' in output) {
    const { result } = output;
    if (typeof result === 'string') return result;
  }
  return null;
}

/** The latest user message rendered to text, used as the prompt stored alongside the image. */
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
