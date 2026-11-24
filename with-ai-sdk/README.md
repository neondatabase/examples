<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and the AI SDK

Two image functions built with the [Vercel AI SDK](https://ai-sdk.dev) (v6), running on Neon Functions. Both call the [Neon AI Gateway](https://neon.com) through [`@neon/ai-sdk-provider`](https://www.npmjs.com/package/@neon/ai-sdk-provider), upload each generated image to a Neon-managed S3-compatible bucket, and index it in [Neon](https://neon.com) Postgres via [Drizzle ORM](https://orm.drizzle.team):

- `imagegen` is a chat agent. It streams a GPT-5 chat completion, and when the model calls the gateway's built-in `image_generation` tool, the JPEG it returns is stored.
- `geminiimage` takes a prompt and generates the image with `gemini-3-1-flash-image`, which returns the image itself in `result.files`.

Everything the app needs — the database URL, the AI Gateway endpoint, and the object-storage credential — is declared in `neon.ts` and injected by `neon dev`, so there are no secrets to copy around.

## Project structure

```
with-ai-sdk/
├── neon.ts             # Neon policy: AI Gateway + object-storage bucket + both functions
├── drizzle.config.ts   # Drizzle Kit config (schema location + DB credentials)
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts        # imagegen: streamText + the image_generation tool
│   ├── gemini-image.ts # geminiimage: generateText with gemini-3-1-flash-image
│   ├── persist.ts      # Uploads an image to the bucket and records it in Postgres
│   └── db/
│       └── schema.ts   # Drizzle schema (images table)
└── package.json
```

## What it does

### `imagegen`: chat agent with the image_generation tool

`POST /` with an AI-SDK-style messages payload:

```json
{ "messages": [{ "role": "user", "content": "Draw a watercolor of a sleepy elephant." }] }
```

The handler:

1. Streams the assistant's response as a UI-message stream (consumable by the AI SDK React/Vue/Svelte hooks).
2. Uses an OpenAI/GPT-5 model on the Neon AI Gateway (`gpt-5-mini`) via the `neon()` provider from `@neon/ai-sdk-provider`, with the gateway's built-in `neon.tools.imageGeneration()` tool.
3. When the model generates an image, the handler uploads the returned JPEG to your bucket and records the prompt + key + size in Postgres, logging a presigned view URL.

> The `image_generation` tool is an OpenAI Responses built-in, so it works with OpenAI models only. The image is returned **inline as base64**. The supported image models are `gpt-image-2` (the default), `gpt-image-1.5`, and `gpt-image-1-mini`; pass `model` to `neon.tools.imageGeneration()` to pick another one. Always stream image generation, as this function does with `streamText`: a non-streaming response whose image is over 655,360 bytes fails with 400. The function asks for a low-quality, compressed JPEG to keep generation fast.

### `geminiimage`: Gemini image model

`POST /` with a prompt:

```json
{ "prompt": "Generate an image of a lighthouse at dusk." }
```

The handler calls `generateText` with `gemini-3-1-flash-image`, stores every image in `result.files` as a PNG, and returns them:

```json
{
  "images": [{ "id": 3, "key": "generated/0e39….png", "bytes": 1800765, "url": "https://…" }],
  "text": "",
  "imageTokens": 1120
}
```

A 1K image costs 1,120 image output tokens. See [Image output pricing](https://neon.com/docs/ai-gateway/models#image-output-pricing) for the price per image size. To use `gemini-3-pro-image` instead, change `MODEL` in `src/gemini-image.ts`.

## Clone the repository

```bash
npx degit neondatabase/examples/with-ai-sdk ./with-ai-sdk
cd with-ai-sdk
```

## Install and update the Neon CLI to latest

```bash
npm i -g neon@latest
neon login
```

## Install dependencies

```bash
npm install
```

## Link your Neon project

```bash
neon link
```

## Provision and deploy

Provision the services declared in `neon.ts`:

```bash
neon deploy
```

> Note: `neon deploy` automatically runs an `env pull` that fetches the declared services' credentials and environment variables and writes them to a local `.env.local` file for development.

## Apply the schema

```bash
npm run db:push
```

## Run locally

```bash
neon dev
```

Then in another shell (use the ports `neon dev` printed; `imagegen` is first):

```bash
curl -N -X POST http://localhost:8787 \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Please draw a robot reading a book."}]}'

curl -X POST http://localhost:8788 \
  -H 'content-type: application/json' \
  -d '{"prompt":"Generate an image of a robot reading a book."}'
```

Each image becomes a new row in the `images` table plus an object in your bucket: a `.jpg` from `imagegen`, a `.png` from `geminiimage`. The logs print a presigned view URL.

To continue the conversation, send the running transcript back (this agent is stateless — the client owns the history):

```bash
curl -N -X POST http://localhost:8787 \
  -H 'content-type: application/json' \
  -d '{"messages":[
    {"role":"user","content":"Please draw a robot reading a book."},
    {"role":"assistant","content":"Here is a friendly robot reading under a warm lamp."},
    {"role":"user","content":"Now draw the same robot, but make it red."}
  ]}'
```

## Test your deployed function

You already deployed both functions in the provisioning step. Grab their invocation URLs and call them:

```bash
# List each function to find its invocation URL
neon functions get imagegen
neon functions get geminiimage

# Then call them (replace with your URLs)
curl -N -X POST https://<your-branch>-imagegen.compute.<region>.aws.neon.tech \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Please draw a robot reading a book."}]}'

curl -X POST https://<your-branch>-geminiimage.compute.<region>.aws.neon.tech \
  -H 'content-type: application/json' \
  -d '{"prompt":"Generate an image of a robot reading a book."}'
```

Redeploy after changing a function with `neon deploy`.
