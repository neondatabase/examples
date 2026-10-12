<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Realtime Next.js app

An SSR todo app built with Next.js, React, Drizzle, and Neon Realtime. The
server renders the initial Drizzle query, then the browser keeps that same
typed query live. Mutations update the current tab optimistically and wait for
their Postgres transaction to arrive through Realtime.

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

The app parses and validates the database name from `DATABASE_URL`, keeping
Realtime tied to the same database connection.

Create and seed the todo table:

```bash
npm run db:setup
```

## Run the app

```bash
npm run dev
```

Open <http://localhost:3000> in two tabs. Add, complete, or delete an item in
either tab; the current tab updates optimistically while the other tab updates
through Neon Realtime.

The initial rows and sealed query are produced during server rendering. The
backend keeps `NEON_REALTIME_SECRET` private and sends only the sealed query and
public WebSocket URL to the browser. This demo does not authenticate its Server
Actions; add authorization before adapting it for a production application.

## Type flow

```text
Drizzle query -> sealed query -> Next.js Server Component -> useLiveQuery
```

The todo row type is inferred from Drizzle and carried by the sealed query;
there is no handwritten API response or todo type.
