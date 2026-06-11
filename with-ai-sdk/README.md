<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and the AI SDK

An AI agent built with the [Vercel AI SDK](https://ai-sdk.dev), running on Neon Functions. It streams a chat completion through the [Neon AI Gateway](https://neon.com) and exposes a `generateImage` tool: when the model calls it, an SVG illustration is generated, uploaded to a Neon-managed S3-compatible bucket, and indexed in [Neon](https://neon.com) Postgres via [Drizzle ORM](https://orm.drizzle.team).

Everything the app needs — the database URL, the AI Gateway endpoint, and the object-storage credential — is declared in `neon.ts` and injected by `neonctl dev`, so there are no secrets to copy around.

## Project structure

```
with-ai-sdk/
├── neon.ts             # Neon policy: AI Gateway + object-storage bucket + the function
├── drizzle.config.ts   # Drizzle Kit config (schema location + DB credentials)
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts        # The agent: streamText + generateImage tool, S3 + Drizzle persistence
│   └── db/
│       └── schema.ts   # Drizzle schema (images table)
└── package.json
```

## What it does

`POST /` with an AI-SDK-style messages payload:

```json
{ "messages": [{ "role": "user", "content": "Draw a watercolor of a sleepy elephant." }] }
```

The handler:

1. Streams the assistant's response as a UI-message stream (consumable by the AI SDK React/Vue/Svelte hooks).
2. Exposes a `generateImage` tool, backed by a Neon AI Gateway model (`databricks-gpt-5-mini`).
3. When the tool runs, it asks the model for a self-contained SVG, uploads it to your bucket, and records the prompt + key + size in Postgres — then returns a presigned view URL.

> Note: the Neon AI Gateway serves text/chat models, so this example draws with SVG (which an LLM can emit as text) rather than a raster image model.

## Clone the repository

```bash
npx degit neondatabase/examples/with-ai-sdk ./with-ai-sdk
cd with-ai-sdk
```

## Install and authenticate the Neon CLI

```bash
npm i -g neonctl
neon login
```

## Link your Neon project

```bash
neon link
```

If you let your agent drive this, add `--agent` to skip interactive mode.

## Configure your environment

`neon link` (and `neon env pull`) write your branch-scoped variables into `.env.local`. Because `neon.ts` enables the AI Gateway and a bucket, the pull also mints a branch credential and writes `OPENAI_API_KEY` / `OPENAI_BASE_URL` and the `AWS_*` storage variables. See `.env.example` for the full set.

## Install dependencies

```bash
npm install
```

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
curl -N -X POST http://localhost:8787 \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Please draw a robot reading a book."}]}'
```

You'll see the streaming response, and once the tool runs, a new row in the `images` table plus an `.svg` object in your bucket (the logs print a presigned view URL).

## Deploy to Neon Functions

```bash
neon deploy
```

This applies the `neon.ts` policy (creating the bucket + enabling the AI Gateway on the branch if needed) and deploys the agent as a Neon Function.
