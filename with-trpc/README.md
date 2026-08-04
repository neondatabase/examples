<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and tRPC

A [tRPC](https://trpc.io) API on [Hono](https://hono.dev) (via [`@hono/trpc-server`](https://github.com/honojs/middleware/tree/main/packages/trpc-server)), backed by [Lakebase Postgres](https://neon.com/docs/postgres/overview) and [Drizzle ORM](https://orm.drizzle.team), deployed as a [Neon Function](https://neon.com/docs/compute/functions/overview).

End-to-end typesafe procedures over HTTP: no code generation, Zod-validated inputs, and a typed client from the shared `AppRouter` type.

## Project structure

```
with-trpc/
├── neon.ts             # Neon Functions policy (defineConfig) - what gets deployed
├── drizzle.config.ts   # Drizzle Kit config (schema location + DB credentials)
├── tsconfig.json
├── .env.example        # Required environment variables
├── src/
│   ├── index.ts        # Hono app + tRPC middleware (the function entry)
│   ├── router.ts       # tRPC procedures (list / byId / create / delete)
│   ├── env.ts          # DATABASE_URL helper
│   └── db/
│       ├── client.ts   # pg pool + Drizzle
│       └── schema.ts   # todos table
└── package.json
```

## What it does

| Procedure | Type | Description |
| --------- | ---- | ----------- |
| `list` | query | List all todos |
| `byId` | query | Fetch one todo by id |
| `create` | mutation | Insert a todo (`{ text }`) |
| `delete` | mutation | Delete a todo by id |

## Clone the repository

```bash
npx degit neondatabase/examples/with-trpc ./with-trpc
cd with-trpc
```

## Install and authenticate the Neon CLI

```bash
npm i -g neon
neon login
```

## Install dependencies

```bash
npm install
```

## Link your Neon project

Link (or create) a Neon project by running the `link` command from the workspace root:

```bash
neon link
```

If you let your agent drive this, add `--agent` to skip interactive mode.

`neon link` pulls your branch-scoped environment variables including `DATABASE_URL` into `.env.local`. You can also find your connection string in the [Neon Console](https://console.neon.tech).

## Apply the schema

Push the Drizzle schema to your Neon database:

```bash
npm run db:push
```

## Run locally

```bash
neon dev
```

Then in another shell (use the port `neon dev` printed, default `8787`):

```bash
# Health check
curl http://localhost:8787/

# Create a todo (tRPC mutation via POST)
curl -X POST 'http://localhost:8787/trpc/create' \
  -H 'content-type: application/json' \
  -d '{"text":"ship it"}'

# List todos (tRPC query via GET; empty input)
curl 'http://localhost:8787/trpc/list'

# Get one todo (query input is a URI-encoded JSON value, here the number 1)
curl 'http://localhost:8787/trpc/byId?input=1'

# Delete a todo (mutation input is the JSON number 1)
curl -X POST 'http://localhost:8787/trpc/delete' \
  -H 'content-type: application/json' \
  -d '1'
```

### Typed client (from another app)

Share the `AppRouter` type and call procedures with full TypeScript inference:

```ts
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "./src";

const client = createTRPCProxyClient<AppRouter>({
  links: [httpBatchLink({ url: "http://localhost:8787/trpc" })],
});

const todos = await client.list.query();
const created = await client.create.mutate({ text: "ship it" });
```

## Deploy to Neon Functions

Deploy the tRPC API as a Neon Function to your branch:

```bash
npm run deploy
# equivalent: neon deploy --env .env.local
```

## Test your deployed function

Grab the function's invocation URL and call it:

```bash
# List the function to find its invocation URL
npm run endpoint
# equivalent: neon functions get trpc

# Then call it (replace with your URL)
curl https://<your-branch>-trpc.compute.<region>.aws.neon.tech/trpc/list
```

> [!IMPORTANT]
> A Neon Function is exposed through a **public HTTPS endpoint, accessible to anyone.**  
> This example is provided as a demo and does not enforce authentication.  
> For production use, ensure you validate a token or API key at the start of the handler before exposing a real tRPC API.
