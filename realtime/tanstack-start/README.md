# Neon Realtime todos with TanStack Start + TanStack DB

A TanStack Start loader seeds a request-scoped `DbClient` and dehydrates it for the browser. The Realtime collection adapter synchronizes the hydrated collection. Optimistic inserts, updates, and deletes remain pending until `awaitTxId()` confirms the committed Postgres transaction.

Open two tabs and add, complete, or delete a todo. Both tabs update through the
managed Neon Realtime WebSocket endpoint. This demo uses public query-sealing
and mutation endpoints; it has no login flow. Authenticate those endpoints
before adapting it for private data.

## Prerequisites

- Node.js 22.18 or newer and npm.
- A Neon CLI release with Realtime support (`neon realtime --help` and
  `neon env pull --help` must list Realtime).
- A Neon account with access to Realtime.

## Install dependencies

From this example's directory:

```sh
npm install
```

## Connect to Neon

Check that the Neon CLI is signed in:

```sh
neon me
```

If necessary, sign in with `neon login`. Create a PG18 project, using your
organization ID from `neon orgs list`, or reuse an existing PG18 project:

```sh
neon projects create --name realtime-tanstack-start-demo \
  --org-id <your-org-id> --region-id aws-us-east-2 --pg-version 18 --no-secrets
```

Use the project ID from the output to link this directory to its default branch:

```sh
neon link --project-id <project-id> --no-config --no-env-pull -y
neon projects update <project-id> --enable-logical-replication --yes
```

To use another branch, add `--branch <name-or-id>` to the link command.

Logical replication is required for incremental changes. Enabling it restarts
the project's computes and cannot be reversed. Enable it before starting the
app; `db:setup` checks for logical WAL. The initial link skips its automatic
env pull because Realtime is provisioned in the next step.

## Configure Realtime

This example's `neon.ts` enables Realtime and declares its allowed browser
origins:

```ts
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  realtime: {
    allowedOrigins: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
    ],
  },
});
```

Review and apply the configuration, then pull the app's environment:

```sh
neon config plan
neon deploy
npm run realtime:env
```

`neon deploy` applies `neon.ts` to the linked branch and pulls its Neon-managed
environment variables. It is an alias for `neon config apply`. When updating
an existing origin policy, review the plan and use `neon deploy --update-existing`.

`npm run realtime:env` runs `neon env pull --service postgres --service realtime
--file .env.local`, then copies `NEON_REALTIME_URL` to `VITE_NEON_REALTIME_URL` for
the browser. The CLI pulls `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
`NEON_REALTIME_URL`, `NEON_REALTIME_SECRET`, and `NEON_REALTIME_DATABASE_NAME`.
It waits up to 60 seconds for Realtime provisioning or secret rotation; if it
times out, retry the pull. The secret stays server-only. Existing custom keys
in `.env.local` are preserved.

The CLI can also configure Realtime directly on the linked branch:

```sh
neon realtime enable \
  --allowed-origin http://localhost:3000 \
  --allowed-origin http://127.0.0.1:3000 \
  --allowed-origin http://localhost:5174 \
  --allowed-origin http://127.0.0.1:5174
npm run realtime:env
```

Direct CLI commands request branch changes without editing `neon.ts`. Keep its
`realtime.allowedOrigins` list in sync so a later deploy uses the same policy.
To add Realtime declaratively to another app, use `neon config add realtime
--allowed-origin https://app.example.com`, then review and apply its config.

Do not copy `.env.example` over `.env.local`. For manual configuration, add its
keys to the existing file. The server derives the subscription database name
from `DATABASE_URL`; schema setup uses `DATABASE_URL_UNPOOLED` when available.

The `@tanstack/router-core` override keeps Start, Router, and the DB SSR
integration on the same Router core version. Keep these versions aligned when
upgrading TanStack dependencies.

## Run

```sh
npm run db:setup
npm run dev
```

Open <http://localhost:3000> in two tabs. The schema setup is repeatable:
it creates `realtime_todos`, sets `REPLICA IDENTITY FULL`, and seeds one todo
only when the table is empty.

## Build and run the production server locally

```sh
npm run typecheck
npm run build
npm start
```

Open <http://localhost:3000>. The app server provides the frontend,
query-sealing endpoint, and mutations.

The Nitro beta build currently emits warnings about a large browser chunk,
`use client` directives in bundled dependencies, and a bundler timing label.
The build succeeds; the smoke suite covers SSR, hydration, mutations, renewal,
and reconnect with this configuration.

To deploy, use a host for this framework's Node server and set the variables
from `.env.example`. The public WebSocket URL is embedded at build time, so
configure it before building. Add the deployed origin to `realtime.allowedOrigins` in `neon.ts`, review
`neon config plan`, and apply it with `neon deploy --update-existing`.
The managed Realtime service runs on Neon; the application server runs on
your chosen app host.

`neon deploy` configures Neon services. Deploy the application server with
your app host's tooling, and use `npm run dev` for local development.
