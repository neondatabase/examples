<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and the AI SDK

A [Bun](https://bun.sh) HTTP handler that uses the [Vercel AI SDK](https://ai-sdk.dev) to stream chat completions with an `generateImage` tool. When the model calls the tool, the generated image is converted to PNG, uploaded to a Neon-managed S3-compatible bucket, and a row is inserted into [Neon](https://neon.com) Postgres via [Drizzle ORM](https://orm.drizzle.team).

## Project structure

```
with-ai-sdk/
├── drizzle.config.ts
├── src/
│   ├── index.ts         # Bun fetch handler, streamText + tool, S3 + Drizzle persistence
│   └── db/
│       └── schema.ts    # Drizzle schema (images table)
├── .env.example
├── package.json
└── tsconfig.json
```

## What it does

`POST /` with an OpenAI-style messages payload:

```json
{ "messages": [{ "role": "user", "content": "Draw a watercolor of a sleepy elephant." }] }
```

The handler:

1. Streams the assistant's response back as a UI-message stream (consumable by the AI SDK React/Vue/Svelte hooks).
2. Exposes a `generateImage` tool to the model, backed by OpenAI's `gpt-image-1`.
3. After the stream finishes, walks every step's tool results, converts each returned JPEG to PNG via `sharp`, uploads it to your bucket, and records the prompt + key + dimensions in Postgres.

## Clone the repository

```bash
npx degit neondatabase/examples/with-ai-sdk ./with-ai-sdk
cd with-ai-sdk
```

## Configure your environment

```bash
cp .env.example .env
```

Fill in:

- `DATABASE_URL` — your Neon connection string ([Neon Console](https://console.neon.tech)).
- `OPENAI_API_KEY` — for both the chat model and the image model.
- `NEON_BUCKETS_*` — endpoint, region, access key, secret key, and bucket name for your Neon-managed S3-compatible object storage. Any S3-compatible service (AWS S3, R2, MinIO) works if you point these vars at it.

## Install dependencies

```bash
bun install
```

## Apply the schema

```bash
bun run db:push
```

## Run it

```bash
bun run dev
```

Then in another shell:

```bash
curl -N -X POST http://localhost:3000 \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Please generate an image of a robot reading a book."}]}'
```

You'll see the streaming response on stdout, and a new row in the `images` table plus a PNG in your bucket once the run completes.
