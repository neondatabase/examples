import { AwsClient } from 'aws4fetch'

/**
 * Neon Object Storage is S3-compatible, so all this needs is SigV4 over `fetch`.
 * aws4fetch rather than the AWS SDK: the only operations are PUT and presigned
 * GET, three signed HTTP requests, and this is ~7KB against the SDK's hundreds.
 *
 * Two Neon specifics: the endpoint is explicit (not guessable from a hostname),
 * and only path-style URLs (`<endpoint>/<bucket>/<key>`) are served.
 */
// Object key prefix within the bucket. Empty here, the bucket is
// already named `photos`, so keys are just `<id>.jpg` at its root.
const IMAGE_PREFIX = ''

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set (see .env.local)`)
  return v
}

let cached: AwsClient | null = null
function client(): AwsClient {
  cached ??= new AwsClient({
    accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
    service: 's3',
    region: process.env.AWS_REGION ?? 'us-east-2',
  })
  return cached
}

export function bucket(): string {
  return process.env.S3_BUCKET ?? 'storage-test'
}
const bucketUrl = () => `${requireEnv('AWS_ENDPOINT_URL_S3').replace(/\/+$/, '')}/${bucket()}`
const objectKey = (filename: string) => (IMAGE_PREFIX ? `${IMAGE_PREFIX}/${filename}` : filename)
const objectUrl = (filename: string) => `${bucketUrl()}/${objectKey(filename)}`

export async function putImage(filename: string, body: Uint8Array, contentType = 'image/jpeg') {
  const res = await client().fetch(objectUrl(filename), {
    method: 'PUT',
    body: body as BodyInit,
    headers: { 'content-type': contentType },
  })
  if (!res.ok) throw new Error(`PUT ${objectKey(filename)} failed: ${res.status} ${await res.text()}`)
}

export async function deleteImage(filename: string) {
  const res = await client().fetch(objectUrl(filename), { method: 'DELETE' })
  // S3 returns 204 on delete, 404 if already gone, both are fine for cleanup.
  if (!res.ok && res.status !== 404) throw new Error(`DELETE ${objectKey(filename)} failed: ${res.status}`)
}

/** Presigned GET URL: local HMAC, no round trip, pasteable into <img src>. */
export async function imageUrl(filename: string, expiresIn = 3600): Promise<string> {
  const url = new URL(objectUrl(filename))
  url.searchParams.set('X-Amz-Expires', String(expiresIn))
  const signed = await client().sign(url.toString(), { method: 'GET', aws: { signQuery: true } })
  return signed.url
}
