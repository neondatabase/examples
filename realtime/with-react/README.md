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

You can start your own copy of this example with
`neon bootstrap my-app --template realtime-react`.

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

If provisioning takes longer than the command's readiness window, pull the env
again. `--service realtime` makes the pull wait until Realtime is ready, and
`--service postgres` writes `DATABASE_URL` too:

```bash
neon env pull --service postgres --service realtime
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

Open <http://localhost:5173> in two tabs. Add, complete, or delete an item in
either tab; the current tab updates optimistically while the other tab updates
through Neon Realtime.

Realtime accepts WebSocket connections only from the browser origins listed in
`neon.ts`, which allows just `http://localhost:5173`. Other origins, such as a LAN address
or a deployed URL, are rejected. To allow another origin, add it to
`preview.realtime.allowedOrigins` in `neon.ts` and run `neon deploy` again.

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
