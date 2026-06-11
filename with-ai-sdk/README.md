<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and the AI SDK

An [AI SDK](https://ai-sdk.dev) agent on Neon Functions: it streams chat through the [Neon AI Gateway](https://neon.com), generates an image with OpenAI's `image_generation` tool, stores the JPEG in [Neon](https://neon.com) object storage, and indexes it in Neon Postgres with [Drizzle ORM](https://orm.drizzle.team).

## Project structure

```
with-ai-sdk/
├── neon.ts             # Neon Functions policy (defineConfig) — AI Gateway + bucket + function
├── drizzle.config.ts   # Drizzle Kit config (schema location + DB credentials)
├── tsconfig.json
├── .env.example        # Environment variables injected by neon link / neon dev
├── src/
│   ├── index.ts        # streamText + image_generation tool, S3 + Drizzle persistence
│   └── db/
│       └── schema.ts   # Drizzle schema (images table)
└── package.json
```

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

Link (or create) a Neon project by running the `link` command from the workspace root:

```bash
neon link
```

If you let your agent drive this, add `--agent` to skip interactive mode.

## Configure your environment

`neon link` automatically pulls your branch-scoped environment variables into the `.env.local` file. Because `neon.ts` enables the AI Gateway and an object-storage bucket, the pull also mints a branch credential and writes the gateway (`OPENAI_API_KEY`, `OPENAI_BASE_URL`) and storage (`AWS_*`) variables — see `.env.example` for the full set.

## Install dependencies

```bash
npm install
```

## Apply the schema

Push the Drizzle schema to your Neon database:

```bash
npm run db:push
```

## Run locally

```bash
neonctl dev
```

Then in another shell (use the port `neon dev` printed):

```bash
curl -N -X POST http://localhost:8787 \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Generate an image of a robot reading a book."}]}'
```

You'll see the streaming response, and once the image is generated a new row in the `images` table plus a `.jpg` object in your bucket (the logs print a presigned view URL).

## Deploy to Neon Functions

Deploy the agent as a Neon Function to your branch:

```bash
neonctl deploy
```

## Test your deployed function

Grab the function's invocation URL and call it:

```bash
# List the function to find its invocation URL
neonctl functions get imagegen

# Then call it (replace with your URL)
curl -N -X POST https://<your-branch>-imagegen.compute.<region>.aws.neon.tech \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Generate an image of a robot reading a book."}]}'
```

## How image generation works

The Neon AI Gateway exposes image generation as the OpenAI Responses **`image_generation`** built-in tool (GPT-5 models only — there is no separate images endpoint), wired up here via the AI SDK's `openai.tools.imageGeneration()`. It runs server-side in a single call and returns the image inline as base64. The gateway caps a response at ~640 KB, so the example requests a compressed JPEG (`outputFormat: 'jpeg'`, `quality: 'low'`, `outputCompression`); larger/higher-quality images can exceed the cap or hit the ~60s gateway timeout.
