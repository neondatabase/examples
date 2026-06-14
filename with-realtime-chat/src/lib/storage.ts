import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Neon Object Storage is S3-compatible; region/endpoint/credentials are read
// from the injected AWS_* env automatically.
const BUCKET = 'uploads';
const s3 = new S3Client({
  forcePathStyle:
    (process.env.NEON_STORAGE_FORCE_PATH_STYLE ?? 'true').toLowerCase() !== 'false',
});

export async function putImage(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

// 7-day expiry (the SigV4 max) so chat-history images keep loading.
export function presignImage(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: 604800,
  });
}
