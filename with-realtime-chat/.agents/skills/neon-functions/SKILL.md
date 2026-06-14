---
name: neon-functions
description: >-
  Long-running, serverless Node.js HTTP functions deployed onto your Neon
  branch, with DATABASE_URL injected automatically and compute that runs next
  to your data. Use when a user wants to host an API, an AI agent with long
  streaming responses, a WebSocket or server-sent-events (SSE) server, a
  webhook handler, a Discord bot, or any request/response workload that risks
  timing out on short, lambda-style serverless functions — and wants it to
  branch with their database. Triggers include "serverless function", "deploy
  an API", "long-running function", "streaming agent", "SSE server",
  "WebSocket server", "webhook handler", "run code next to my database",
  "function that won't time out", "Neon Functions", and "Neon Compute".
---

# Neon Functions

This is a preview feature and only available in `us-east-2`. Neon Functions are long-running Node.js HTTP handlers deployed onto a Neon branch. Each function gets a public HTTPS URL, runs in the same region as your database, and — if the branch has Postgres — gets `DATABASE_URL` injected automatically. You deploy and manage them through the same Neon CLI, `neon.ts`, and API you already use.

Use this skill to help the user define, run locally, deploy, and manage functions next to their database. Deliver a deployed function with its invocation URL, a working local `neonctl dev` loop, or a precise answer from the official Neon docs.

## When to Use

Reach for Neon Functions when the workload is a request/response handler that benefits from staying alive and staying close to the data:

- **Long-running request/response flows that outlast lambda-style limits.** Agents that make several LLM calls and tool invocations per request, or image/video generation, routinely blow past the ~10–60s execution caps and short streaming windows of traditional serverless functions. Neon Functions are long-running: the handler just needs to _start_ responding within 15 minutes, and an open stream stays alive as long as bytes keep flowing. That's enough headroom for real agent workloads.
- **Stateful streaming without bolting on Redis.** Because a function stays alive across a request, it can host an SSE endpoint or a WebSocket server and hold the connection open in-process — no external state store (Redis, etc.) needed just to keep a stream coherent. Module-scope state (a `pg` pool, an in-memory counter) persists across requests on the same isolate.
- **Compute that must sit next to Postgres.** The function runs in the same region as the branch's database, so there are no cross-region round trips on every query. `DATABASE_URL` is injected for you.
- **A backend that branches with your data.** Each branch runs its own version of the function at its own URL, against its own isolated database (and storage, and gateway) state. Preview deployments, CI, and dev environments each get a self-contained backend — deploying to a child never affects the parent.
- **Webhooks, bots, and post-response work.** Webhook handlers that fan out into multiple DB writes, Discord/WebSocket bots, and fire-and-forget follow-ups via `waitUntil` (analytics, audit logs) all fit.

If the workload is a pure static site, a cron/background job that needs its own lifecycle and cancellation, or something that must run outside `us-east-2` today, this isn't the right tool yet (see Timeouts and Availability below).

## What It Does

- **Long-running & serverless** — Built for WebSocket servers, SSE endpoints, long agent HTTP streams, and APIs. Still scales to zero when idle.
- **Web-standard handler** — A function is any default export with a `fetch(request)` method returning a `Response` (Workers/WinterTC-compatible). A Hono app exports exactly that shape, so `export default app` just works. Runs on Node.js 24, so all Node APIs are available.
- **Close to your database** — Runs in the branch's region; `DATABASE_URL` injected automatically when the branch has Postgres.
- **Branchable** — Each branch runs its own function version at its own URL against its own isolated state.
- **Same CLI/API** — Deploy and manage via `neonctl`, `neon.ts`, or the Neon API.

## Architecture: where Functions fit

Neon (Functions included) is **backend primitives, not full-stack app hosting**. Host your app on **Vercel** (or Netlify, or another frontend/app host); Functions are the long-running, stateful slice of your backend that lives next to your data. They compose with that platform in two ways:

- **Add a Function to a full-stack app.** Your Next.js / TanStack Start app on Vercel (or Netlify) owns UI, auth (e.g. Neon Auth), and talks directly to Neon Postgres and Object Storage. When one workload outgrows the host's short serverless limits — a WebSocket or SSE server, or a long-running agent that would time out — move just that piece onto a Neon Function. (See [Functions as an agent backend](#functions-as-an-agent-backend-nextjs-and-similar-frameworks) for the client-direct pattern.)
- **Run the whole backend control plane on Functions.** Especially when the frontend is **client-only** — TanStack Router, React Router in client mode, and similar SPAs hosted on Vercel or Netlify — the client calls Functions **directly**. Build REST APIs and request/response agents, host **MCP servers**, and run anything stateful or that belongs close to Postgres and Object Storage.

Either way, secure a Function like any standalone REST API: verify a JWT or API key at the top of the handler (see the WARNING under [Functions as an agent backend](#functions-as-an-agent-backend-nextjs-and-similar-frameworks)). Because a Function is just your backend, you can **move pieces between your host and Neon** — relocate an agent or a stateful WebSocket server onto a Function when it needs more runtime, and back if needed.

## Setup

Functions are declared in `neon.ts` (see the `neon` skill for the branch-first workflow and `neon.ts` basics). Add `@neondatabase/config` and declare functions under `preview.functions`, keyed by **slug**:

```typescript
// neon.ts
import { defineConfig } from "@neondatabase/config/v1";

export default defineConfig({
  preview: {
    functions: {
      todos: {
        // slug: ^[a-z0-9]{1,20}$ — lowercase letters/digits, no hyphens
        name: "todo api", // display label only
        source: "src/index.ts", // entry file, relative to neon.ts
      },
    },
  },
});
```

The slug is the function's permanent identity (it appears in the invocation URL and CLI commands) and can't be changed after the first deploy. Use `name` for a human-readable label.

A minimal function — a Hono app that queries the branch's Postgres via the injected `DATABASE_URL`:

```typescript
// src/index.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { parseEnv } from "@neondatabase/env/v1";
import config from "../neon";
import { todos } from "./db/schema";

const env = parseEnv(config);
const pool = new Pool({ connectionString: env.postgres.databaseUrl, max: 5 });
const db = drizzle(pool);

const app = new Hono();
app.get("/", (c) => c.text("Neon + Hono + Drizzle"));
app.post("/todos", async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  const [row] = await db.insert(todos).values({ text }).returning();
  return c.json(row, 201);
});
app.get("/todos", async (c) => c.json(await db.select().from(todos)));

export default app;
```

This is the `with-hono` example, verified end to end. Create the `pg` pool at module scope (reused across requests on the same isolate) and keep `max` small (e.g. 5), since each isolate keeps its own pool.

## Develop locally and deploy

```bash
neonctl dev      # serves every function in neon.ts with hot reload; injects DATABASE_URL & friends
neonctl deploy   # bundles with esbuild, uploads, and applies neon.ts to the linked branch
```

To deploy a single function without `neon.ts`: `neonctl functions deploy <slug> --path . --entry src/index.ts`. Retrieve the public URL with `neonctl functions get <slug>` (the `invocation_url` field, of the form `https://<branch_id>-<slug>.compute.c-1.us-east-2.aws.neon.tech`). Manage with `neonctl functions list|get|delete`.

When `neonctl checkout` _creates_ a new branch and a `neon.ts` is present, it applies the policy automatically — deploying the function to the fresh branch. Checking out an existing branch does not re-deploy; run `neonctl deploy` explicitly.

## Environment variables

Neon injects branch-scoped connection strings and service URLs at runtime — you don't declare these or pass them at deploy time:

| Variable                | Notes                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `NEON_BRANCH`           | The branch **name** (e.g. `main`, `preview/foo`). Injected on every branch, including the default. |
| `DATABASE_URL`          | Pooled connection string. Use for most queries. Present only if the branch has Postgres. |
| `DATABASE_URL_UNPOOLED` | Direct connection. Use for migrations, `LISTEN`/`NOTIFY`, multi-round-trip transactions. |
| `NEON_AUTH_BASE_URL`    | Present when Neon Auth is enabled on the branch.                                         |
| `NEON_DATA_API_URL`     | Present when the Data API is enabled on the branch.                                      |

Object storage (`AWS_*`) and AI Gateway (`OPENAI_*`, `NEON_AI_GATEWAY_*`) vars are also injected when those services are declared — see the `neon-object-storage` and `neon-ai-gateway` skills.

`neonctl env pull` / `neon-env run` / `neonctl dev` emit `NEON_BRANCH` (and the connection strings) into your local dev environment too, so local runs mirror the deployed runtime.

**Your own secrets** are per-deployment. Set them with `--env KEY=VALUE` on `neonctl functions deploy` (repeatable; `--env KEY=` deletes a key, unmentioned keys carry over), or declare them in `neon.ts` under the function's `env` (resolved at deploy time, so read from `process.env` to avoid hardcoding):

```typescript
functions: {
  todos: {
    name: "todo api",
    source: "src/index.ts",
    env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY! },
  },
}
```

Load a `.env` before deploy with `neonctl deploy --env .env.production`. Pull the branch's Neon-managed vars onto disk for local dev with `neonctl env pull` (`link`/`checkout` do this automatically; pass `--no-env-pull` to skip and use `neon-env run -- <cmd>` for runtime injection). Limits: ≤1,000 vars, ≤64 KiB total, and the `NEON_` prefix is reserved.

## Connecting to Postgres

When the branch has Postgres, Neon **injects the connection strings at runtime** — you don't declare them, pass them at deploy time, or hardcode anything. The two you'll use:

- `DATABASE_URL` — **pooled** connection string (routed through Neon's connection pooler). Use it for normal request/response query traffic. Kept un-prefixed because every Postgres ORM (Drizzle, Prisma, Knex, …) reads `DATABASE_URL` by default.
- `DATABASE_URL_UNPOOLED` — **direct** connection string to the same database. Use it for migrations, `LISTEN`/`NOTIFY`, and long multi-statement transactions.

Create the connection pool **once at module scope** and reuse it across requests — don't open a connection per request:

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Created once per isolate; reused by every request that isolate handles.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const db = drizzle(pool);
```

**Pooling is recommended because an isolate is reused across many requests** (and several requests can be in flight on the same isolate at once — see [Timeouts and runtime limits](#timeouts-and-runtime-limits)). A module-scope pool is opened once on cold start and then shared by every subsequent request that isolate serves, so you amortize connection setup instead of paying it on every request and you avoid exhausting Postgres connections under load.

Keep `max` small (e.g. `5`): each isolate keeps its own pool, so total connections to Postgres scale with the number of live isolates. Drain the pool when the runtime evicts the isolate so connections close cleanly:

```typescript
process.on("SIGINT", () => {
  pool.end().then(() => process.exit(0));
});
```

> Reading `process.env.DATABASE_URL` directly works everywhere. The `with-hono` example in [Setup](#setup) instead uses `@neondatabase/env/v1`'s `parseEnv(config)` to read the same value in a typed, validated way — either is fine.

## Integrations and observability

A function is a long-lived Node.js process running a web-standard request/response handler, so standard Node integration SDKs work unchanged — initialize them once at module load, gated on an env var so local dev and unconfigured branches stay a no-op, and pass secrets via `--env` or `neon.ts` `env`. For wiring up **Sentry** error monitoring across the HTTP framework, the function runtime, and an agent's own caught/fallback failures (the long-running case Functions target), see [references/integrations.md](references/integrations.md). For running a **Mastra** agent on a function and shipping its traces to a **Mastra Studio (Mastra Cloud)** project for observability, see [references/mastra-studio.md](references/mastra-studio.md).

## Timeouts and runtime limits

Functions are long-running but **still serverless** — they are a request/response runtime, not a background job runner. The hard limits:

- **Time to first byte: 15 minutes.** Your handler must _begin_ returning a response within 15 minutes of receiving a request. Most handlers finish in seconds; the 15-minute ceiling exists so agent workloads like image/video generation have room.
- **Heartbeat: 15 minutes.** Open WebSocket/SSE connections stay alive as long as data flows. The timeout only fires when a connection goes silent — send at least one byte every 15 minutes to keep a quiet stream alive.
- **`waitUntil`: 15 minutes.** Work registered with `waitUntil` keeps the invocation alive after the response is sent, up to 15 minutes — for cleanup like analytics writes and audit logs, **not** a background job runner. (`waitUntil` from `@neondatabase/functions/v1` is currently a stub during the preview.)
- **Idle eviction.** With no active connections the platform shuts the function down; it may also evict/restart for operational reasons (active functions can run for hours first). Treat eviction like a process restart — WebSocket/SSE clients must reconnect. The platform sends `SIGINT` before evicting, so register a handler to drain gracefully:

```typescript
process.on("SIGINT", () => {
  pool.end().then(() => process.exit(0));
});
```

- **Runtime:** Node.js 24, memory fixed at 2048 MiB during the preview. Slugs must match `^[a-z0-9]{1,20}$`. **An isolate is reused across many requests** — multiple requests can be in flight on the same isolate at once (interleaved on Node's single-threaded event loop), and under load the runtime runs several isolates in parallel, each with its own copy of module state. State held in module scope is therefore per-isolate (shared by every request that isolate handles) and in-memory only — persist anything that must survive eviction in Postgres. This reuse is exactly why you create a connection pool once at module scope rather than per request (see [Connecting to Postgres](#connecting-to-postgres)).

## Functions as an agent backend (Next.js and similar frameworks)

A Neon Function is a great home for an AI agent precisely because it **doesn't time out** the way lambda-style serverless does (15-minute budget, see above). But that advantage disappears the moment you **proxy the agent stream through your web app's backend** — a Next.js route handler, Remix/SvelteKit/Nuxt action, etc. hosted on Vercel, Netlify, Cloudflare, and the like. Those platforms cap serverless/edge execution at short windows (often ~10–60s, sometimes up to ~300s), so a long agent or image/video generation stream gets cut off mid-response even though the Neon Function would happily keep going.

**The fix: call the function directly from the client.** Don't route the long request through your app server.

```
Browser ──(Authorization: Bearer <JWT>)──▶  Neon Function (agent)   ✅ no host timeout
Browser ──▶ your app backend ──▶ Neon Function                       ❌ host cuts the stream
```

- Mint a **short-lived JWT** on your app backend (e.g. better-auth's `jwt` plugin, NextAuth, or your own signer) — that call is fast and well within host limits.
- Hand the token to the client and have it call the Neon Function **directly** (cross-origin), e.g. with the Vercel AI SDK: `new DefaultChatTransport({ api: NEON_FUNCTION_URL, fetch })` where `fetch` attaches `Authorization: Bearer <token>`. Your app server is never in the path of the long stream.
- Add **CORS** so the browser can reach it (handle `OPTIONS`, set `Access-Control-Allow-Origin`/`-Headers`).

> [!WARNING]
> A Neon Function has a **public HTTPS URL — it is reachable by anyone.** A direct client→function call means there is no app backend in front of it to gate access, so **you must authenticate the function yourself.** Verify a JWT (e.g. against your app's JWKS), check a shared secret / API key, or validate a session token at the top of the handler and reject anything else. Never deploy an unauthenticated agent.

```typescript
// src/index.ts — verify the caller before doing any work
import { createRemoteJWKSet, jwtVerify } from "jose";

const jwks = createRemoteJWKSet(new URL(`${process.env.AUTH_BASE_URL}/api/auth/jwks`));

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });

    const auth = request.headers.get("authorization");
    if (!auth?.toLowerCase().startsWith("bearer ")) {
      return new Response("Unauthorized", { status: 401, headers: cors(request) });
    }
    try {
      const { payload } = await jwtVerify(auth.slice(7), jwks, {
        issuer: process.env.AUTH_BASE_URL,
        audience: process.env.AUTH_BASE_URL,
      });
      const userId = payload.sub; // scope the agent to this user
      // ... run the agent, return result.toUIMessageStreamResponse({ headers: cors(request) })
    } catch {
      return new Response("Unauthorized", { status: 401, headers: cors(request) });
    }
  },
};
```

Pass the JWKS/issuer URL to the function via its `env` (see Environment variables). Persist anything you need to keep (generated images, history) in Postgres — module state doesn't survive eviction.

## Availability

Neon Functions is a preview (early access) feature available only on new projects in the `us-east-2` region. Confirm the user's Neon project is a new project in `us-east-2`; it can't be enabled on existing projects. Functions usage isn't billed during the private preview. If the user does not yet have access, point them to the private beta sign-up: https://neon.com/blog/were-building-backends#access

## Neon Documentation

The Neon documentation is the source of truth and Functions is evolving rapidly, so always verify against the official docs. Any doc page can be fetched as markdown by appending `.md` to the URL or by requesting `Accept: text/markdown`. Find the right page from the docs index (https://neon.com/docs/llms.txt) and the changelog announcements.

## Further reading

- https://neon.com/docs/compute/functions/overview.md
- https://neon.com/docs/compute/functions/get-started.md
- https://neon.com/docs/compute/functions/deploy.md
- https://neon.com/docs/compute/functions/environment-variables.md
- https://neon.com/docs/compute/functions/reference/neon-ts.md
- https://neon.com/docs/compute/functions/reference/runtime-limits.md
- https://neon.com/docs/compute/functions/preview-access.md
