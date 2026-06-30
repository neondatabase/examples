<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and the AI SDK

An AI agent built with the [Vercel AI SDK](https://ai-sdk.dev) (v6), running on Neon Functions. It streams a chat completion through the [Neon AI Gateway](https://neon.com) using the [`@neon/ai-sdk-provider`](https://www.npmjs.com/package/@neon/ai-sdk-provider) and the gateway's built-in `image_generation` tool: when the model calls it, a JPEG is generated, uploaded to a Neon-managed S3-compatible bucket, and indexed in [Neon](https://neon.com) Postgres via [Drizzle ORM](https://orm.drizzle.team).

Everything the app needs — the database URL, the AI Gateway endpoint, and the object-storage credential — is declared in `neon.ts` and injected by `neonctl dev`, so there are no secrets to copy around.

## Project structure

```
with-ai-sdk/
├── neon.ts             # Neon policy: AI Gateway + object-storage bucket + the function
├── drizzle.config.ts   # Drizzle Kit config (schema location + DB credentials)
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts        # The agent: streamText + image_generation tool, S3 + Drizzle persistence
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
2. Uses an OpenAI/GPT-5 model on the Neon AI Gateway (`gpt-5-mini`) via the `neon()` provider from `@neon/ai-sdk-provider`, with the gateway's built-in `neon.tools.imageGeneration()` tool.
3. When the model generates an image, the handler uploads the returned JPEG to your bucket and records the prompt + key + size in Postgres, logging a presigned view URL.

> Notes on the gateway's image generation: it's the OpenAI Responses **`image_generation`** built-in tool (GPT-5 models only — there is no separate images endpoint), and the image is returned **inline as base64**. The gateway caps a response at ~640 KB, so this example requests a compressed JPEG (`outputFormat: 'jpeg'`, `quality: 'low'`, `outputCompression`) to stay under it; high-quality/large images can exceed the cap or hit the ~60s gateway timeout.

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

## Install dependencies

```bash
npm install
```

## Link your Neon project

```bash
neon link
```

If you let your agent drive this, add `--agent` to skip interactive mode.

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
curl -N -X POST http://localhost:8787 \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Please draw a robot reading a book."}]}'
```

You'll see the streaming response, and once the tool runs, a new row in the `images` table plus a `.jpg` object in your bucket (the logs print a presigned view URL).

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

You already deployed the agent in the provisioning step. Grab its invocation URL and call it:

```bash
# List the function to find its invocation URL
neon functions get imagegen

# Then call it (replace with your URL)
curl -N -X POST https://<your-branch>-imagegen.compute.<region>.aws.neon.tech \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Please draw a robot reading a book."}]}'
```

Redeploy after changing the function with `neon deploy`.
