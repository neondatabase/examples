# Presigned uploads with Neon Object Storage

A Neon Function that hands out short-lived S3 URLs so a browser or another service can upload and download files without holding your storage credentials. Files land in a Neon Object Storage bucket, which branches with your database.

## Scaffold it

```bash
npm install -g neon@latest
neon login
neon link
neon functions new presigned-uploads
```

The CLI writes `functions/presigneduploads/index.ts`, declares the function in `neon.ts`, and installs the template's dependencies.

Create the bucket the template expects:

```bash
neon config add bucket uploads
```

Or add the `buckets` block to the `neon.ts` that `neon functions new` created:

```ts
buckets: {
  uploads: { access: "private" },
},
```

Object Storage is available in `aws-us-east-2`, `aws-us-east-1`, `aws-eu-central-1`, and `aws-ap-southeast-1`. See [Object Storage](https://neon.com/docs/storage/overview).

Deploy once so Neon creates the bucket and pulls `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, and `AWS_REGION` into your local env file (`.env`, or `.env.local` when there is no `.env`):

```bash
neon deploy
```

## Run locally

```bash
neon dev
```

The default URL is `http://localhost:8787/` and prints the route list plus the bucket setup steps.

Get a presigned upload URL:

```bash
curl -s http://localhost:8787/uploads \
  -H 'content-type: application/json' \
  -d '{"filename":"hello.txt","contentType":"text/plain"}'
```

Example response:

```json
{
  "key": "6f0d...-hello.txt",
  "uploadUrl": "https://br-....storage...",
  "method": "PUT",
  "headers": { "content-type": "text/plain" },
  "expiresIn": 300
}
```

Upload a file to the presigned URL:

```bash
curl -X PUT "<uploadUrl>" \
  -H 'content-type: text/plain' \
  --data-binary 'hello from Neon'
```

List the bucket and get a download URL:

```bash
curl -s http://localhost:8787/files
curl -s "http://localhost:8787/files/download?key=<key>"
```

## Routes

| Route | Purpose |
| --- | --- |
| `GET /` | Route list, bucket name, and setup steps. |
| `POST /uploads` | `{ filename, contentType }` returns a presigned PUT URL. |
| `GET /files` | Lists up to 100 objects in the bucket. |
| `GET /files/download?key=...` | Returns a presigned GET URL with an attachment filename. |