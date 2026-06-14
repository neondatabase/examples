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
- The function verifies the JWT, stores each message in Postgres, and fans it out to every connected client across isolates using Postgres `LISTEN`/`NOTIFY`.

```
Browser ──(history)──▶ Next.js /api/messages ──▶ Postgres
Browser ──(wss?token=JWT)──▶ Neon Function ──▶ Postgres + NOTIFY ──▶ all clients
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
npm i -g neonctl vercel
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

> `neon link` runs an implicit `env pull` that warns it can't find the function declared in `neon.ts` yet. That's expected — provision it in the next step.

## Provision the declared services

`neon.ts` declares Neon Auth and the `chat` function. Apply the policy so they exist on your branch:

```bash
neonctl config apply
```

## Configure your environment

Pull your branch-scoped variables into `.env.local`:

```bash
neonctl env pull
```

You should see `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_AUTH_BASE_URL`, and `NEON_AUTH_JWKS_URL`.

## Apply the schema

```bash
npm run db:push
```

## Run locally

Start the function (serves on `http://localhost:8787`):

```bash
neonctl dev
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

## Deploy the function to Neon

```bash
neonctl deploy
```

Grab the function's invocation URL — this is your `wss://` endpoint:

```bash
neonctl functions get chat
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
- **Fan-out across isolates.** Under load the runtime may run several isolates, each with its own connected clients. Each isolate `LISTEN`s on a Postgres channel; new messages are `NOTIFY`'d so every isolate broadcasts to its own sockets — making the chat genuinely shared.
- **Reconnect.** The client reconnects with exponential backoff (re-minting a token each attempt), since serverless isolates can be evicted when idle.
- **Moderation gate (Mastra agent).** Every message is broadcast instantly, then a Mastra agent — running inside the function, using the Neon AI Gateway — classifies it. If it's inappropriate (sexual, harassment, hate, threats) the message is deleted and a `delete` event is broadcast, so it disappears for everyone (retroactive moderation). The agent is only ever triggered by authenticated WebSocket messages — there's no public endpoint to invoke it. Agent runs are traced to **Mastra Cloud (Studio)** for observability.
- **Image uploads (Neon Object Storage).** You can't stream a file over the chat WebSocket, so images are uploaded over HTTP to the function's JWT-gated `/upload` route, stored in Neon Object Storage, and a presigned URL is returned; the chat message then carries that URL over the WebSocket. The history endpoint requires a valid Neon Auth session.
- **One way to reach Postgres.** Both the function and the Next.js app use Drizzle + `node-postgres` against the pooled `DATABASE_URL`. In the web app the pool is created once at module scope and registered with `attachDatabasePool` (`@vercel/functions`) so Vercel Fluid Compute drains idle connections before suspending the instance — reusing connections without leaking them.
