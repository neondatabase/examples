import { openai } from '@ai-sdk/openai';
import { streamText, tool, generateText, stepCountIs, type ModelMessage } from 'ai';
import { z } from 'zod';
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

// A text/chat model served by the Neon AI Gateway (OpenAI Responses dialect).
// OPENAI_API_KEY / OPENAI_BASE_URL are injected by `neon dev`, so `openai()` targets
// the branch gateway with no extra wiring.
const MODEL = 'databricks-gpt-5-mini';

async function persistImage(prompt: string, svg: string) {
  const body = Buffer.from(svg, 'utf8');
  const key = `generated/${randomUUID()}.svg`;
  const contentType = 'image/svg+xml';

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

    const result = streamText({
      model: openai(MODEL),
      // Stop after the tool runs. The Neon AI Gateway's upstream currently 502s on the
      // multi-step "send the tool result back to the model" round-trip, so we keep this a
      // single step: the model calls generateImage, the tool generates + stores the SVG,
      // and the tool result (with the view URL) is what streams back to the client.
      stopWhen: stepCountIs(1),
      system:
        'You are an illustration agent. When the user asks for a picture, call the ' +
        'generateImage tool with a vivid one-sentence description of what to draw.',
      messages,
      tools: {
        generateImage: tool({
          description:
            'Generate an SVG illustration from a description, store it in Neon object ' +
            'storage, and index it in Postgres. Returns the stored key and a view URL.',
          inputSchema: z.object({
            description: z.string().describe('What to draw'),
          }),
          execute: async ({ description }) => {
            console.log(`[generateImage] ${description}`);
            const { text } = await generateText({
              model: openai(MODEL),
              prompt:
                'Return ONLY a single self-contained SVG document (it must start with ' +
                '"<svg" and end with "</svg>") that illustrates the following, using a ' +
                `512x512 viewBox and a few flat colored shapes: ${description}. ` +
                'No markdown, no code fences, no commentary.',
            });
            const svg = extractSvg(text);
            if (!svg) throw new Error('The model did not return an SVG document.');
            const saved = await persistImage(description, svg);
            return { description, ...saved };
          },
        }),
      },
      onStepFinish({ toolResults }) {
        for (const tr of toolResults) {
          if (tr.toolName === 'generateImage') {
            const out = tr.output as { url?: string };
            console.log(`[step] stored image -> ${out.url}`);
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

/** Pull the first `<svg>…</svg>` block out of a model response (drops any stray prose). */
function extractSvg(text: string): string | null {
  const match = text.match(/<svg[\s\S]*<\/svg>/i);
  return match ? match[0] : null;
}
