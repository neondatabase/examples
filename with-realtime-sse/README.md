<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon realtime SSE

A minimal realtime counter: a client-only [TanStack Router](https://tanstack.com/router) SPA talking over **server-sent events (SSE)** to a [Hono](https://hono.dev) server running on [Neon Functions](https://neon.com/docs/compute/functions/overview), with the count stored in [Neon](https://neon.com) Postgres via [Drizzle ORM](https://orm.drizzle.team).

There is one shared counter for everyone:

- The browser opens an **`EventSource` directly to the Neon Function** and renders the current value.
- Clicking **Increment** `POST`s to the function, which bumps the counter in Postgres and `NOTIFY`s the new value.
- Every isolate `LISTEN`s on that channel and pushes the value to its own SSE clients, so **all open tabs update at once** — no polling.

```
Browser ──(GET /events, SSE)──▶ Neon Function ──▶ keeps the stream open
Browser ──(POST /increment)──▶ Neon Function ──▶ Postgres + NOTIFY ──▶ all SSE clients
```

## Project structure

```
with-realtime-sse/
├── neon.ts                 # Neon policy: the `counter` function
├── drizzle.config.ts       # Drizzle Kit config
├── .env.example            # Function environment variables
├── src/
│   ├── index.ts            # Hono `fetch` app: /count, /increment, /events (SSE)
│   └── db/
│       └── schema.ts       # Drizzle schema (counters)
└── web/                    # TanStack Router SPA (Vite + React), deploy on Vercel
    ├── .env.example        # Web environment variables
    └── src/
        ├── main.tsx        # Router setup + render
        └── components/
            └── counter.tsx # EventSource subscription + increment button
```

## Clone the repository

```bash
npx degit neondatabase/examples/with-realtime-sse ./with-realtime-sse
cd with-realtime-sse
```

## Install and authenticate the Neon CLI

```bash
npm i -g neon
neon login
```

## Install dependencies

```bash
npm install              # the function
npm install --prefix web # the SPA
```

## Link your Neon project

```bash
neon link
```

If you let your agent drive this, add `--agent` to skip interactive mode.

`neon link` pulls your branch-scoped variables — `DATABASE_URL` and `DATABASE_URL_UNPOOLED` — into `.env.local`.

## Apply the schema

```bash
npm run db:push
```

## Run locally

Start the function (serves on `http://localhost:8787`):

```bash
neon dev
```

Configure the SPA — copy `web/.env.example` to `web/.env.local`:

```bash
VITE_FUNCTION_URL="http://localhost:8787"
```

Then run the app:

```bash
npm run dev --prefix web
```

Open `http://localhost:3000`, then open a second tab and click **Increment** — both update instantly.

## Deploy the function to Neon

```bash
neon deploy
```

Grab the function's invocation URL — this is your SSE endpoint:

```bash
neon functions get counter
# invocation_url: https://<branch>-counter.compute.<region>.aws.neon.tech
```

Quick check from the terminal — stream events in one shell and increment from another:

```bash
# Shell 1: subscribe (stays open, prints each new value)
curl -N https://<branch>-counter.compute.<region>.aws.neon.tech/events

# Shell 2: increment
curl -X POST https://<branch>-counter.compute.<region>.aws.neon.tech/increment
```

## Deploy the SPA to Vercel

The SPA is a static client-only build. From the `web/` directory:

```bash
cd web
vercel link
vercel env add VITE_FUNCTION_URL production   # the deployed function URL (https://…)
vercel deploy --prod
```

Lock the function down to your deployed origin by setting `WEB_ORIGIN` on the function:

```bash
neon deploy --env <(echo "WEB_ORIGIN=https://<your-app>.vercel.app")
```

## How it works

- **SSE on Neon Functions.** Neon Functions are long-running Node.js handlers, so the function holds each `GET /events` connection open and streams new values down it. A comment heartbeat every 25s keeps otherwise-idle streams from being closed.
- **State in Postgres, not memory.** The counter is a single row in Postgres. Module state doesn't survive isolate eviction, so the value (and every new client's starting point) always comes from the database.
- **Fan-out across isolates.** Under load the runtime may run several isolates, each with its own set of SSE clients. Each isolate `LISTEN`s on a Postgres channel; an increment `NOTIFY`s the new value so every isolate pushes it to its own clients — making the counter genuinely shared.
- **Direct browser → function.** The SPA has no backend of its own; `EventSource` and the increment `fetch` call the function directly (cross-origin), so the function sets CORS headers and verifies nothing beyond the demo's needs. Add auth (e.g. a JWT check) before putting anything sensitive behind it.
- **Reconnect for free.** `EventSource` reconnects automatically when an isolate is evicted or the network drops, so the client needs no manual backoff.
