<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon realtime chat

A minimal full-stack realtime chat: a [Next.js](https://nextjs.org) app with [Neon Auth](https://neon.com/docs/neon-auth/overview), talking over **WebSockets** to a [Hono](https://hono.dev) server running on [Neon Functions](https://neon.com/docs/compute/functions/overview), with messages stored in [Neon](https://neon.com) Postgres via [Drizzle ORM](https://orm.drizzle.team).

There is one shared chat for all signed-in users:

- The **Next.js app** (deployed on Vercel) handles sign in / sign up with Neon Auth and serves chat history from Postgres.
- The browser opens a **WebSocket directly to the Neon Function**, authenticated with a Neon Auth JWT.
- The function verifies the JWT and stores each message in Postgres; every isolate polls for new messages and pushes them to its own clients.

```
Browser ──(history)──▶ Next.js /api/messages ──▶ Postgres
Browser ──(wss?token=JWT)──▶ Neon Function ──▶ Postgres
                             Neon Function ──(poll Postgres ~1s)──▶ all clients
```

## Project structure

```
with-realtime-chat/
├── neon.ts                 # Neon policy: Neon Auth + the `chat` function
├── drizzle.config.ts       # Drizzle Kit config
├── .env.example            # Function environment variables
├── src/
│   ├── index.ts            # Hono `fetch` + WebSocket `upgrade` (the function)
│   └── db/
│       └── schema.ts       # Drizzle schema (messages)
└── web/                    # Next.js app (Neon Auth + chat UI), deploy on Vercel
    ├── .env.example        # Web environment variables
    └── src/
        ├── app/            # login page, chat page, /api/auth, /api/messages
        ├── components/     # chat + shadcn/ui
        └── lib/auth/       # Neon Auth client + server
```

## Clone the repository

```bash
npx degit neondatabase/examples/with-realtime-chat ./with-realtime-chat
cd with-realtime-chat
```

## Install and authenticate the CLIs

The Neon CLI provisions and deploys the function; the [Vercel CLI](https://vercel.com/docs/cli) is the recommended way to deploy and configure the Next.js app.

```bash
npm i -g neon vercel
neon login
vercel login
```

## Install dependencies

```bash
npm install          # the function
npm install --prefix web   # the Next.js app
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

Start the function (serves on `http://localhost:8787`):

```bash
neon dev
```

Allow `localhost` as a Neon Auth redirect domain so sign-in works in dev:

```bash
neon neon-auth domain allow-localhost
```

Configure the web app — copy `web/.env.example` to `web/.env.local` and fill it in:

```bash
NEON_AUTH_BASE_URL="..."                 # from .env.local
NEON_AUTH_COOKIE_SECRET="..."            # openssl rand -base64 32
DATABASE_URL="..."                       # from .env.local
NEXT_PUBLIC_CHAT_WS_URL="ws://localhost:8787"   # the function's URL with ws://
```

Then run the app:

```bash
npm run dev --prefix web
```

Open `http://localhost:3000`, sign up, and open a second browser to watch messages arrive in realtime.

## Get the deployed function URL

You already deployed the `chat` function in the provisioning step. Grab its invocation URL — this is your `wss://` endpoint (redeploy after changes with `neon deploy`):

```bash
neon functions get chat
# invocation_url: https://<branch>-chat.compute.<region>.aws.neon.tech
```

## Deploy the Next.js app to Vercel

Vercel is the recommended host for Next.js. Deploy from the `web/` directory:

```bash
cd web
vercel link        # create/link a Vercel project
```

### Sync environment variables to Vercel

The app needs four variables in Vercel. Add them with the CLI (run from `web/`):

```bash
vercel env add NEON_AUTH_BASE_URL production
vercel env add NEON_AUTH_COOKIE_SECRET production    # openssl rand -base64 32
vercel env add DATABASE_URL production
vercel env add NEXT_PUBLIC_CHAT_WS_URL production     # wss:// form of the function URL
```

`NEXT_PUBLIC_CHAT_WS_URL` is the deployed function URL with `wss://`, e.g. `wss://<branch>-chat.compute.<region>.aws.neon.tech`. Repeat for `preview`/`development` if you want those targets too, or pull them back locally with `vercel env pull`.

Then build and deploy:

```bash
vercel build --prod
vercel deploy --prebuilt --prod
```

### Trust the Vercel domain in Neon Auth

So sign-in works from your deployed app, add its origin as a Neon Auth trusted domain (from the project root):

```bash
neon neon-auth domain add https://<your-app>.vercel.app
```

## How it works

- **WebSockets on Neon Functions.** Neon Functions are long-running Node.js handlers, so the function exports `{ fetch, upgrade }`: Hono serves HTTP via `fetch`, and the `ws` library handles the WebSocket handshake in `upgrade(req, socket, head)`. See `src/index.ts`.
- **Auth over WebSockets.** Browsers can't set headers on a WebSocket, so the client passes its Neon Auth JWT as `?token=`. The function verifies it against the Neon Auth JWKS before accepting the connection.
- **Fan-out across isolates.** Under load the runtime may run several isolates, each with its own connected clients. Every isolate polls Postgres for new messages and broadcasts them to its own sockets, so the chat stays shared across isolates without any cross-isolate messaging. See [Real-time considerations](#real-time-considerations).
- **Reconnect.** The client reconnects with exponential backoff (re-minting a token each attempt), since serverless isolates can be evicted when idle.
- **One way to reach Postgres.** Both the function and the Next.js app use Drizzle + `node-postgres` against the pooled `DATABASE_URL`. In the web app the pool is created once at module scope and registered with `attachDatabasePool` (`@vercel/functions`) so Vercel Fluid Compute drains idle connections before suspending the instance — reusing connections without leaking them.

## Real-time considerations

This example fans out messages by **polling Postgres** on a short interval: each isolate reads rows newer than the last one it saw and pushes them to its own clients. It needs no extra infrastructure and works with [Scale to Zero](https://neon.com/docs/introduction/scale-to-zero) — an idle compute can still suspend because polling stops when no clients are connected. That's a good fit for demos and low-to-moderate fan-out; the trade-off is up to ~1s of latency. Two alternatives:

- **Postgres `LISTEN`/`NOTIFY`** — lower latency (push instead of poll), but a listener holds an idle connection that Scale to Zero drops on suspend, so it requires **disabling Scale to Zero** to keep the compute always on.
- **A dedicated pub/sub such as [Upstash](https://upstash.com) Redis** — best for high-scale, high-fan-out, or multi-region realtime, at the cost of running another service.
