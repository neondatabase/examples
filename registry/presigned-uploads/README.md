# Presigned uploads with Neon Object Storage

A Neon Function that hands out short-lived S3 URLs so a browser or another service can upload and download files without holding your storage credentials. Files land in a Neon Object Storage bucket, which branches with your database.

## Scaffold it

```bash
npm install -g neon@latest
neon login
neon link
neon functions new presigned-uploads
```

The CLI writes `functions/presigneduploads/index.ts` and declares the function in `neon.ts`.

Create the bucket the template expects:

```bash
neon config add bucket uploads
```

Or declare it in `neon.ts`:

```ts
buckets: {
  uploads: { access: "private" },
},
```

Object Storage is available in `aws-us-east-2`, `aws-us-east-1`, `aws-eu-central-1`, and `aws-ap-southeast-1`. See [Object Storage](https://neon.com/docs/storage/overview).

Deploy once so Neon creates the bucket and injects `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, and `AWS_REGION` into `.env.local`:

```bash
neon deploy --env .env.local
```

## Run locally

```bash
neon dev
```

The default URL is `http://localhost:8787/`.

Ask for an upload URL:

```bash
curl -s http://localhost:8787/uploads \
  -H 'content-type: application/json' \
  -d '{"filename":"hello.txt","contentType":"text/plain"}'
```

```json
{
  "key": "uploads/6f0d...-hello.txt",
  "uploadUrl": "https://br-....storage...",
  "method": "PUT",
  "headers": { "content-type": "text/plain" },
  "expiresIn": 300
}
```

Upload with the URL:

```bash
curl -X PUT "<uploadUrl>" \
  -H 'content-type: text/plain' \
  --data-binary 'hello from Neon'
```

List the bucket and get a download URL:

```bash
curl -s http://localhost:8787/files
curl -s "http://localhost:8787/files/download?key=uploads/<key>"
```

## Routes

| Route | Purpose |
| --- | --- |
| `POST /uploads` | `{ filename, contentType }` returns a presigned PUT URL. |
| `GET /files` | Lists up to 100 objects under `uploads/`. |
| `GET /files/download?key=...` | Returns a presigned GET URL with an attachment filename. |

## Notes

- The bucket name is the `BUCKET` constant near the top of the module. Change it in both the code and `neon.ts` if you want a different name.
- The client must send the same `Content-Type` that was signed. Do not add extra headers to the PUT.
- Browser uploads need a CORS rule on the bucket. Neon Object Storage supports S3 `PutBucketCors`; the `curl` flow above does not need it.
- Presigned URLs are bearer capabilities. Keep the upload TTL short and treat the URL like a password.
- `POST /uploads` and `GET /files` are unauthenticated demos. Add authentication before pointing this at a real bucket: anyone with the function URL can mint upload URLs and list keys. Delete objects through the Neon Console, `neon buckets object rm`, or the S3 API.
