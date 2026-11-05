# Presigned uploads with Neon Object Storage

This Neon Function hands out short-lived S3 URLs, so a browser or another service can upload and download files without your storage credentials. The files go to a Neon Object Storage bucket, which branches with your database.

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

You can also add the `buckets` block to the `neon.ts` that `neon functions new` created:

```ts
buckets: {
  uploads: { access: "private" },
},
```

Object Storage is available in `aws-us-east-2`, `aws-us-east-1`, `aws-eu-central-1`, and `aws-ap-southeast-1`. See [Object Storage](https://neon.com/docs/storage/overview).

Function URLs are public, so the function only answers callers that send a token you choose. Generate one and add it to `.env.local`:

```bash
export UPLOADS_FUNCTION_TOKEN=$(openssl rand -hex 32)
echo "UPLOADS_FUNCTION_TOKEN=$UPLOADS_FUNCTION_TOKEN" >> .env.local
```

<EnvironmentVariables>

- `UPLOADS_FUNCTION_TOKEN`: A random token of at least 32 characters, for example from `openssl rand -hex 32`, that callers send as `Authorization: Bearer <token>`. Neon Function URLs are public, so the function requires it.

</EnvironmentVariables>

Deploy once so Neon creates the bucket and pulls `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, and `AWS_REGION` into `.env.local`:

```bash
neon deploy --env .env.local
```

## Run locally

```bash
neon dev
```

`neon dev` serves the function at `http://localhost:8787/` by default. `GET /` returns the route list, the setup steps, and whether `UPLOADS_FUNCTION_TOKEN` is set, and it's the only route that works without the token.

Get a presigned upload URL:

```bash
curl -s http://localhost:8787/uploads \
  -H "authorization: Bearer $UPLOADS_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"filename":"hello.txt","contentType":"text/plain"}'
```

Example response (`201`):

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
curl -s http://localhost:8787/files \
  -H "authorization: Bearer $UPLOADS_FUNCTION_TOKEN"
curl -s "http://localhost:8787/files/download?key=<key>" \
  -H "authorization: Bearer $UPLOADS_FUNCTION_TOKEN"
```

## Routes

<Operations>

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /` | None | Route list, bucket name, setup steps, and whether the token is set. |
| `POST /uploads` | Bearer `UPLOADS_FUNCTION_TOKEN` | `{ filename, contentType }` returns `201` with a presigned PUT URL that expires in 5 minutes. |
| `GET /files` | Bearer `UPLOADS_FUNCTION_TOKEN` | Lists up to 100 objects in the bucket. |
| `GET /files/download?key=...` | Bearer `UPLOADS_FUNCTION_TOKEN` | Returns a presigned GET URL with an attachment filename that expires in 1 hour, or `404` if the key doesn't exist. |

</Operations>

A missing or shorter-than-32-character `UPLOADS_FUNCTION_TOKEN` returns `503` with setup instructions, a missing or wrong bearer token returns `401`, a malformed body returns `400`, and any other path or method returns `404` or `405`.

## Deploy

```bash
neon deploy --env .env.local
neon functions get presigneduploads
```

`neon functions get` prints the function's public URL. Call it the same way as locally, with the bearer token.

## Notes

- Keep `UPLOADS_FUNCTION_TOKEN` on your server. Call this function from your backend after you've checked who the user is, then hand only the presigned `uploadUrl` or `downloadUrl` to the browser.
- A presigned PUT can't cap the file size. Check `size` from `GET /files` after upload, or delete objects you don't want.
