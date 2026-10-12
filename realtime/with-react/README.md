<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Realtime React app

A fully typed todo app built with React, Hono RPC, Drizzle, and Neon Realtime.
The row type starts at the Drizzle query in the Hono backend, crosses the HTTP
boundary through Hono RPC, and is inferred by `useLiveQuery` in React. There is
no handwritten todo or API response type.

## Set up Neon

Install dependencies, authenticate, and link a Neon project:

```bash
npm install
neon login
neon link
```

Deploy the `neon.ts` policy to enable Realtime. The deploy waits for Realtime to
be ready and writes its URL, secret, and database name to `.env.local`:

```bash
neon deploy
```

If provisioning takes longer than the command's readiness window, retry the env
pull once Realtime is ready:

```bash
neon env pull
```

Create the todo table and configure it for Realtime updates:

```bash
npm run db:setup
```

## Run the app

```bash
npm run dev
```

Open <http://localhost:5173> in two tabs. Add, complete, or delete an item in
either tab; the current tab updates optimistically while the other tab updates
through Neon Realtime.

The backend keeps `NEON_REALTIME_SECRET` private. It seals the Drizzle query and
returns only the sealed query and public WebSocket URL to the browser. This demo
does not authenticate its API routes; add authorization before adapting it for
a production application.

## Type flow

```text
Drizzle query → Hono route type → Hono RPC client → sealed query → useLiveQuery
```

`web/src/api.ts` imports `AppType` with a type-only import, so no backend code or
secret is included in the browser bundle.
