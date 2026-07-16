<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Sentry

A streaming, tool-calling AI agent ([Vercel AI SDK](https://ai-sdk.dev) via the Neon AI Gateway) on Neon Functions, instrumented with [Sentry](https://sentry.io): errors as issues, recoverable failures as structured logs, and the full `gen_ai` span hierarchy (agent → model → tool, with token usage) in traces.

## Project structure

```
with-sentry/
├── neon.ts              # Neon Functions policy — function + AI Gateway + Sentry env
├── tsconfig.json
├── .env.example         # Required environment variables
├── src/
│   ├── instrument.ts    # Sentry init — must be the entry file's first import
│   └── index.ts         # Hono app: /chat (streaming agent), /summarize (fallback agent)
└── package.json
```

## Clone the repository

```bash
npx degit neondatabase/examples/with-sentry ./with-sentry
cd with-sentry
```

## Install and authenticate the Neon CLI

```bash
npm i -g neon
neon login
```

## Install dependencies and configure

```bash
npm install
cp .env.example .env   # fill in SENTRY_DSN (and optionally the rest)
```

## Deploy

```bash
neon deploy
neon functions get withsentry   # invocation_url
```

## Try it

```bash
# Streaming tool-calling agent -> gen_ai trace with tool + token spans
curl -X POST "$URL/chat" -H "content-type: application/json" \
  -d '{"messages":[{"role":"user","content":"Roll 3 dice and tell me the total."}]}'

# Model fallback -> recoverable attempt logged, success traced
curl -X POST "$URL/summarize" -H "content-type: application/json" \
  -d '{"text":"Neon Functions can host AI agents.","models":["bogus-model","meta-llama-3-3-70b-instruct"]}'

# Unhandled route error -> Sentry issue
curl "$URL/debug-sentry"
```

Then check Sentry: **Issues** (the route error), **Explore → Logs** (the `model attempt failed` warning, linked to its trace), and **Explore → Traces / Insights → AI Agents** (the agent span hierarchy). Streamed `gen_ai` spans can take a few minutes to appear — errors and logs land first.

## How the wiring works

The comments in `src/instrument.ts` and `src/index.ts` explain each piece; the short version:

- **Clear the OTel API global before `Sentry.init`** — the runtime pre-creates it with its own `@opentelemetry/api` version, which otherwise silently blocks Sentry's tracer registration (spans vanish while errors/logs keep working).
- **A Hono middleware creates the request root span** and flushes per request — the runtime's ingress isn't auto-instrumented, and telemetry must ship while the request is alive.
- **`vercelAIIntegration({ force: true })`** + per-call `experimental_telemetry` — deploy bundling defeats the integration's module detection.
- **Streaming routes flush from the stream's finalizer** and report stream errors via `onError` — `streamText` never throws.
