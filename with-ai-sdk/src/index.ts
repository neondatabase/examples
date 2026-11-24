import { randomUUID } from 'node:crypto';
import { neon } from '@neon/ai-sdk-provider';
import { generateText, type GeneratedFile } from 'ai';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseEnv } from '@neon/env';
import { attachDatabasePool } from '@neon/functions';
import config from '../neon';
import { images } from './db/schema';

const MODEL = 'gemini-3-1-flash-image';
const BUCKET = 'images';

const { postgres } = parseEnv(config, ['DATABASE_URL']);
const pool = new Pool({ connectionString: postgres.databaseUrl, max: 5 });
attachDatabasePool(pool);
const db = drizzle(pool);

const s3 = new S3Client({
  forcePathStyle: (process.env.NEON_STORAGE_FORCE_PATH_STYLE ?? 'true').toLowerCase() !== 'false',
});

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return new Response('POST {"prompt": "..."} to this endpoint', { status: 405 });
    }

    let prompt: unknown;
    try {
      ({ prompt } = await request.json());
    } catch {
      return Response.json({ error: 'Send a JSON body like {"prompt": "..."}' }, { status: 400 });
    }
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return Response.json({ error: '"prompt" must be a non-empty string' }, { status: 400 });
    }

    const { files } = await generateText({ model: neon(MODEL), prompt });
    if (files.length === 0) {
      return Response.json({ error: `${MODEL} returned no image` }, { status: 502 });
    }

    const saved = await Promise.all(files.map((file) => saveImage(prompt, file)));
    return Response.json({ images: saved });
  },
};

async function saveImage(prompt: string, file: GeneratedFile) {
  const key = `generated/${randomUUID()}.${file.mediaType.split('/')[1]}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: file.uint8Array,
      ContentType: file.mediaType,
    }),
  );

  const [image] = await db
    .insert(images)
    .values({
      prompt,
      bucketKey: key,
      contentType: file.mediaType,
      bytes: file.uint8Array.byteLength,
    })
    .returning({ id: images.id });

  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: 3600,
  });

  return { id: image?.id, key, bytes: file.uint8Array.byteLength, url };
}
