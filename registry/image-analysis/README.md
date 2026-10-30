# Image analysis with AI Gateway

A Neon Function that sends an uploaded image to a vision-capable model through [Neon AI Gateway](https://neon.com/docs/ai-gateway/overview) and returns a description plus structured details.

Send a `multipart/form-data` request with an `image` file.

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new image-analysis --slug imageanalysis
```

The CLI writes `functions/imageanalysis/index.ts` and declares the function in `neon.ts`.

Enable AI Gateway on the linked branch:

```bash
neon config add ai-gateway
```

Or set `aiGateway: true` in `neon.ts`.

AI Gateway requires a paid Neon plan with prepaid credits and a project in a supported region. See the [AI Gateway quickstart](https://neon.com/docs/ai-gateway/get-started).

Deploy once so Neon provisions the gateway and injects `NEON_AI_GATEWAY_BASE_URL` and `NEON_AI_GATEWAY_TOKEN` into `.env.local`:

```bash
neon deploy
```

## Run locally

```bash
neon dev
```

Call the URL that `neon dev` prints (the default is `http://localhost:8787/`). Upload an image:

```bash
curl -X POST http://localhost:8787/ \
  -F "image=@./photo.jpg"
```

Example response:

```json
{
  "description": "A tabby cat stands on a paved path...",
  "details": {
    "subjects": ["tabby cat"],
    "setting": "outdoors on a paved path",
    "text": [],
    "tags": ["cat", "animal", "outdoors", "pavement"]
  },
  "model": "gpt-5-mini"
}
```

## Request format

Send `POST /` with a single `image` field: an image file with an `image/*` content type, up to 10 MB.

A missing image returns `400`, an image over 10 MB returns `413`, a non-image file returns `415`, and an analysis failure returns `502`.

This template does not authenticate requests, so anyone with the function URL can call it. Add auth before exposing a paid endpoint.

The template uses `gpt-5-mini`, which accepts image input. Change `MODEL` in `functions/index.ts` to use another vision model from the [AI Gateway catalog](https://neon.com/docs/ai-gateway/overview#available-models).
