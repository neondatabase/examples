<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Realtime vanilla TypeScript app

A framework-free todo app built with TypeScript, raw SQL, and Neon Realtime.
The browser uses the low-level Realtime client directly, renders DOM elements
without a UI framework, and renews its short-lived query capability explicitly.

## Set up Neon

Install dependencies, authenticate, and link a Neon project:

```bash
npm install
neon login
neon link
```

Deploy the `neon.ts` policy to enable Realtime. The deploy waits for Realtime to
be ready and refreshes `.env.local` with the database connection string and
Realtime credentials:

```bash
neon deploy
```

If provisioning takes longer than the command's readiness window, retry the env
pull once Realtime is ready:

```bash
neon env pull
```

The backend uses `@neon/env` to parse the Neon-managed environment variables.
It derives and validates the Realtime database name from `DATABASE_URL`, keeping
the live query tied to the same database connection.

Create and seed the todo table:

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

The backend keeps `NEON_REALTIME_SECRET` private. It seals a raw SQL query and
returns only the sealed query and public WebSocket URL to the browser. The
browser creates a low-level subscription with `createRealtimeClient()`, renews
the sealed query before it expires, and waits for each mutation's transaction
ID before dropping its optimistic state.

This demo does not authenticate its API routes; add authorization before
adapting it for a production application. The handwritten `Todo` interface in
`src/schema.ts` describes the rows returned by the raw SQL query. An ORM adapter
can infer that row type from a query builder instead.

## Build and run locally

```bash
npm run build
npm start
```

The production server listens on <http://localhost:3001> and serves both the
built frontend and API. Add that origin—or your deployed application's
origin—to `preview.realtime.allowedOrigins` in `neon.ts` before connecting from
it, then run `neon deploy --update-existing`.
