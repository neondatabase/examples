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
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function persistImage(prompt: string, body: Uint8Array, contentType: string) {
  const extension = EXTENSIONS[contentType];
  if (!extension) throw new Error(`Unsupported image type: ${contentType}`);
  const key = `generated/${randomUUID()}.${extension}`;

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
