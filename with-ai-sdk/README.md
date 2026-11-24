<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and the AI SDK

An image generation function built with the [Vercel AI SDK](https://ai-sdk.dev) (v6), running on Neon Functions. It sends a prompt to `gemini-3-1-flash-image` through the [Neon AI Gateway](https://neon.com) with [`@neon/ai-sdk-provider`](https://www.npmjs.com/package/@neon/ai-sdk-provider), uploads each generated image to a Neon-managed S3-compatible bucket, and indexes it in [Neon](https://neon.com) Postgres via [Drizzle ORM](https://orm.drizzle.team).

Everything the app needs — the database URL, the AI Gateway endpoint, and the object-storage credential — is declared in `neon.ts` and injected by `neon dev`, so there are no secrets to copy around.

## Project structure

```
with-ai-sdk/
├── neon.ts             # Neon policy: AI Gateway + object-storage bucket + the function
├── drizzle.config.ts   # Drizzle Kit config (schema location + DB credentials)
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts        # The function: generateText with gemini-3-1-flash-image, S3 + Drizzle persistence
│   └── db/
│       └── schema.ts   # Drizzle schema (images table)
└── package.json
```

## What it does

`POST /` with a prompt:

```json
{ "prompt": "Generate an image of a lighthouse at dusk." }
```

The handler calls `generateText` with `gemini-3-1-flash-image`, uploads every image in `result.files` to your bucket as a PNG, records the prompt, key, and size in Postgres, and returns a presigned view URL for each:

```json
{
  "images": [{ "id": 1, "key": "generated/0e39….png", "bytes": 1800765, "url": "https://…" }]
}
```

A body that isn't JSON or has no `prompt` string returns 400. If the model answers without an image, the function returns 502.

A 1K image costs 1,120 image output tokens. See [Image output pricing](https://neon.com/docs/ai-gateway/models#image-output-pricing) for the price per image size. To use `gemini-3-pro-image` instead, change `MODEL` in `src/index.ts`.

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

Then in another shell (use the port `neon dev` printed):

```bash
curl -X POST http://localhost:8787 \
  -H 'content-type: application/json' \
  -d '{"prompt":"Generate an image of a robot reading a book."}'
```

Each image becomes a new row in the `images` table plus a `.png` object in your bucket.

## Test your deployed function

You already deployed the function in the provisioning step. Grab its invocation URL and call it:

```bash
# List the function to find its invocation URL
neon functions get imagegen

# Then call it (replace with your URL)
curl -X POST https://<your-branch>-imagegen.compute.<region>.aws.neon.tech \
  -H 'content-type: application/json' \
  -d '{"prompt":"Generate an image of a robot reading a book."}'
```

Redeploy after changing the function with `neon deploy`.
