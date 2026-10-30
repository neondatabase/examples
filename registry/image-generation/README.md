# AI image generation with Neon Storage

A Neon Function that generates an image through [Neon AI Gateway](https://neon.com/docs/ai-gateway/overview), stores the JPEG in [Neon Object Storage](https://neon.com/docs/storage/overview), and returns a presigned URL.

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new image-generation --slug imagegeneration
```

The CLI writes `functions/imagegeneration/index.ts` and declares the function in `neon.ts`.

Enable AI Gateway and declare the private `images` bucket:

```bash
neon config add ai-gateway
neon config add bucket images
```

Or add both to `neon.ts`:

```ts
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  aiGateway: true,
  buckets: {
    images: { access: "private" },
  },
  functions: {
    imagegeneration: {
      name: "AI image generation with Neon Storage",
      source: "functions/imagegeneration/index.ts",
    },
  },
});
```

AI Gateway and Object Storage require a project in a supported region. AI Gateway also requires a paid Neon plan with prepaid credits. See [AI Gateway get started](https://neon.com/docs/ai-gateway/get-started) and [Object Storage get started](https://neon.com/docs/storage/get-started).

Deploy once so Neon creates the bucket and injects the `AWS_*` and `NEON_AI_GATEWAY_*` variables into `.env.local`:

```bash
neon deploy
```

## Run locally

```bash
neon dev
```

Call the URL that `neon dev` prints (the default is `http://localhost:8787/`):

```bash
curl -X POST http://localhost:8787/ \
  -H "content-type: application/json" \
  -d '{"prompt":"An astronaut drinking coffee in a neon-lit cafe, cinematic lighting"}'
```

Example response:

```json
{
  "prompt": "An astronaut drinking coffee in a neon-lit cafe, cinematic lighting",
  "url": "https://<branch-id>.storage.<cell>.<region>.aws.neon.tech/images/generated/<uuid>.jpg?...",
  "key": "generated/<uuid>.jpg",
  "bucket": "images",
  "contentType": "image/jpeg",
  "bytes": 48213,
  "expiresIn": 3600,
  "model": "gpt-5-mini",
  "imageModel": "gpt-image-2"
}
```

The presigned URL is valid for one hour. The bucket is private, so the object has no permanent public URL. Reuse the object key with the S3 API to sign a new URL when you need to share it again.

## Request format

| Field | Rule |
| --- | --- |
| `prompt` | Required. A non-empty string up to 2,000 characters. |

Only `POST /` is supported.

This template does not authenticate requests, so anyone with the function URL can call it. Add auth before exposing a paid endpoint.

The template uses `gpt-5-mini` to call the `gpt-image-2` image-generation tool at 1024x1024, JPEG, low quality. Change `MODEL`, `IMAGE_MODEL`, or the tool options in `functions/index.ts` to tune cost and output.