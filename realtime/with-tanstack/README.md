<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Realtime TanStack DB app

An SSR todo app built with TanStack Start, TanStack DB, Drizzle, and Neon
Realtime. The route loader runs the initial Drizzle query on the server and
dehydrates a request-scoped TanStack DB. In the browser, TanStack DB hydrates
those rows, subscribes to the same typed query, and owns optimistic mutations.

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
either tab. TanStack DB updates the current tab optimistically, and Neon
Realtime updates the other tab.

The backend keeps `NEON_REALTIME_SECRET` private and sends only the sealed query
and public WebSocket URL to the browser. Each TanStack DB mutation waits for its
Postgres transaction to arrive through Realtime with `awaitTxId()`. This demo
does not authenticate its Server Functions; add authorization before adapting
it for a production application.

## Type flow

```text
Drizzle query -> sealed query -> TanStack Start loader -> TanStack DB collection
```

The todo row type is inferred from Drizzle and carried by the sealed query;
there is no handwritten API response or todo type.
