<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Realtime TanStack DB app

A per-user todo app built with [TanStack Start](https://tanstack.com/start), [TanStack DB](https://tanstack.com/db), [Drizzle ORM](https://orm.drizzle.team), [Neon Realtime](https://neon.com/docs/realtime/overview) and Neon's [Managed Better Auth](https://neon.com/docs/auth/overview).

- **SSR.** The first HTML already contains the signed-in user's todos.
- **Live.** In the browser, a TanStack DB live query reads a collection that Realtime keeps in sync with Postgres.
- **Optimistic writes.** Changes apply at once. A server function writes them to Postgres, and the change is confirmed when its transaction comes back over Realtime.
- **Auth.** Managed Better Auth, through a small TanStack Start adapter that ships with the example, and [Better Auth UI](https://better-auth-ui.com)'s shadcn/ui sign-in components.

## Project structure

```
my-app/
├── neon.ts                    # Neon policy: Managed Better Auth + Realtime allowedOrigins
├── drizzle.config.ts          # drizzle-kit, reads .env.local
├── .env.example               # Every variable, and where it comes from
└── src/
    ├── router.tsx             # Realtime client + DbClient per router, routerWithDbClient
    ├── schema.ts              # realtime_todos table
    ├── env.server.ts          # Server env, validated at startup
    ├── env.d.ts               # Type for import.meta.env.VITE_NEON_REALTIME_URL
    ├── db.server.ts           # node-postgres pool + Drizzle
    ├── realtime.server.ts     # Seals queries with NEON_REALTIME_SECRET
    ├── todos.server.ts        # selectTodos(userId) and its Todo row type
    ├── todos.schemas.ts       # zod input schemas for writes
    ├── todos.functions.ts     # Server functions: load, refresh, create, update, delete
    ├── todos.collection.ts    # todosCollection(userId, query)
    ├── components/            # Better Auth UI and shadcn/ui components (shadcn CLI)
    ├── lib/                   # cn() and Better Auth UI helpers (shadcn CLI)
    ├── auth/
    │   ├── auth.server.ts     # Managed Better Auth server, wired to Start's request and cookies
    │   ├── auth.functions.ts  # sessionMiddleware, requireUser, getSessionUser
    │   ├── client.ts          # Browser auth client
    │   ├── handler.server.ts  # Proxy to Managed Better Auth
    │   ├── auth-page.tsx      # Better Auth UI's <Auth> (sign-in, sign-up, ...)
    │   ├── auth-ui.css        # shadcn theme for the auth route only
    │   ├── user-menu.tsx      # Email and Sign out button
    │   └── session-lost.ts    # Full page load when the session is gone
    └── routes/
        ├── __root.tsx         # Session in beforeLoad, no-store headers
        ├── _authed.tsx        # Sign-in guard and header
        ├── _authed/index.tsx  # Todos page
        ├── auth/$path.tsx     # Auth pages route
        └── api/auth/$.ts      # Auth proxy route
```

## Get the code

```bash
neon bootstrap my-app --template realtime-tanstack
cd my-app
```

## Set up Neon

Install dependencies and link a Neon project (bootstrap offers to do both):

```bash
npm install
neon login
neon link
```

Provision the services in `neon.ts`. `neon deploy` turns on Realtime and Managed Better Auth for the branch, then writes `NEON_REALTIME_URL`, `NEON_REALTIME_SECRET` and `NEON_AUTH_BASE_URL` to `.env.local` next to `DATABASE_URL`. It doesn't host the app.

```bash
neon deploy
```

If those variables aren't in `.env.local` yet, pull again:

```bash
neon env pull
```

Append two keys to `.env.local`. Don't copy `.env.example` over it; that overwrites `DATABASE_URL`.

```bash
echo 'VITE_NEON_REALTIME_URL=$NEON_REALTIME_URL' >> .env.local
printf '\nNEON_AUTH_COOKIE_SECRET=%s\n' "$(openssl rand -base64 32)" >> .env.local
```

- The single quotes keep `$NEON_REALTIME_URL` literal. Vite expands it when it loads the file, so the browser's Realtime URL follows the branch after each pull.
- The secret is generated once and stored. It signs the session cookie and must be at least 32 characters.
- Run each line once. `neon env pull` leaves both lines in place.

Create the table:

```bash
npm run db:push
```

If this project ran an earlier version of this example, drop its table first: `neon psql -- -c 'drop table if exists realtime_todos'`.

## Run the app

```bash
npm run dev
```

Open <http://localhost:3000>. You're sent to `/auth/sign-in`. Create an account and add a few todos.

- **Live sync.** Open a second tab as the same user. Add, complete or delete a todo in one tab: it updates at once there, and the other tab follows over Realtime.
- **Isolation.** Sign in as a different user in a second browser profile or a private window. That user sees none of the first user's todos. Tabs in one profile share cookies, so they're always the same user.
- **SSR.** Reload and view the source: the rows are in the HTML. The badge goes from "connecting" to "live" when Realtime sends its first complete result. It shows the first sync only: it stays "live" while the socket reconnects.

Notes:

- Safari may reject the Managed Better Auth `__Secure-` cookies on `http://localhost`, so sign-in can fail without an error. Use Chrome or Firefox for local development.
- Localhost is a trusted Managed Better Auth domain by default. If sign-in from localhost is rejected, run `neon neon-auth domain allow-localhost enable`.

## How it works

1. **Router.** `getRouter()` creates a Realtime client and a TanStack DB `DbClient` that holds it. On the server it runs once per request, and its Realtime client never connects. In the browser there's one per page load.
2. **Session.** The root route's `beforeLoad` calls `getSessionUser`. The `_authed` layout sends signed-out visitors to `/auth/sign-in`.
3. **Loader.** `loadTodos` checks the session and returns the user's rows plus a sealed copy of the same query. The loader seeds a `todos:<userId>` collection in the router's `DbClient` with those rows.
4. **Hydration.** `routerWithDbClient` snapshots that collection into the HTML and restores it in the browser before the first render. The page renders with rows and without a hydration mismatch.
5. **Live.** In the browser the collection subscribes to Realtime with the sealed query, and `useLiveQuery` reads it. `refreshTodosQuery` re-seals the query about every 50 seconds. Through a reconnect, or a refresh that lands after the query expired, the collection keeps its rows until Realtime sends the complete result again. The collection stays live for the life of the page (`gcTime: 0`), and the route doesn't refetch it when you navigate back (`staleTime: Infinity`).
6. **Writes.** Each optimistic transaction becomes one call to a POST server function (`createTodos`, `updateTodos` or `deleteTodos`). The function checks the session, validates the batch with zod, and writes it in one SQL statement limited to the user's rows. Its `RETURNING` clause includes `pg_current_xact_id()`, so the collection can wait up to 10 seconds for that transaction to arrive over Realtime (`awaitTxId`) without another database round trip. A failed write rolls back and shows the error. A write that committed but didn't arrive in time also rolls back, with a notice that it was saved, and shows again once live updates reconnect. A row's checkbox and Delete button stay disabled until its last change is confirmed. A write that changes nothing returns `{ txid: null }` and isn't rolled back.
7. **Sign-in and sign-out** are full page loads of `/`, which drop the `DbClient`, the socket and any cached rows. Each query refresh and write sends the user id the page was loaded for. If the session is gone, or another tab has signed in as someone else, the call fails with a 401 and the page reloads `/`. A signed-out visitor goes on to `/auth/sign-in`, and a different user lands on their own list.

The `Todo` type is inferred from the `selectTodos` Drizzle query. The sealed query carries it into the collection and `useLiveQuery`.

## The Managed Better Auth adapter

Managed Better Auth has no official TanStack Start adapter yet, so the example ships a small one on `@neon/auth/server`:

- `src/auth/auth.server.ts` creates the auth server, wired to Start's request and `setCookie`.
- `src/auth/auth.functions.ts` has `sessionMiddleware`, `requireUser` and the `getSessionUser` server function.
- `src/auth/handler.server.ts` proxies `/api/auth/*` to Managed Better Auth, through the route in `src/routes/api/auth/$.ts`.

The sign-in UI is Better Auth UI's `<Auth>` in `src/auth/auth-page.tsx`, with the components it copies into `src/components/` (`npx shadcn add @better-auth-ui/auth`). It and its route, `src/routes/auth/$path.tsx`, are the only files that load them and `src/auth/auth-ui.css`. Leaving that route is always a full page load, so the auth UI's styles don't reach the todos page. The Sign out button in `src/auth/user-menu.tsx` is hand-built for the same reason. `@neon/auth` pins Better Auth exactly, and the `overrides` in `package.json` hold Better Auth UI's peer plugins to the same version, so npm installs one copy. Replace `src/auth/` when an official adapter ships.

## Security

- `NEON_REALTIME_SECRET` and `NEON_AUTH_COOKIE_SECRET` stay on the server. The browser gets sealed queries and the public WebSocket URL.
- A sealed query is a 60-second bearer token for one SQL query and its parameters. It isn't tied to a user: anyone holding it can subscribe until it expires. Pages carry rows and a sealed query, so they're sent with `Cache-Control: private, no-store`. Otherwise, rows and sealed queries only come from POST server functions.
- Users are kept apart only by the `WHERE user_id = …` that the server puts in the sealed query after checking the session. Realtime doesn't know who the user is.
- Every todo server function checks the session again with `requireUser`, and treats a session for a different user than the page's as signed out. The `_authed` redirect only shapes the UI. Writes never take `user_id` from the browser: the user id they send is only checked against the session.
- A session revoked elsewhere can look valid for up to 5 minutes, because server checks trust the session cookie cache (`sessionDataTtl`, 300 seconds by default).
- Server functions rely on Start's default CSRF middleware, which Start only installs when there's no `src/start.ts`. If you add one, add `createCsrfMiddleware` back.

## Deploying elsewhere

This template doesn't host the app. To run it on your own host:

1. Add the app's origin to `preview.realtime.allowedOrigins` in `neon.ts`, then apply it. Realtime rejects browsers from origins that aren't listed.

   ```bash
   neon deploy --update-existing
   ```

2. Trust the origin in Managed Better Auth:

   ```bash
   neon neon-auth domain add https://your-app.example.com
   ```

3. Build with `VITE_NEON_REALTIME_URL` set. Vite inlines it into the bundle at build time.
4. Give the server `DATABASE_URL`, `NEON_REALTIME_URL`, `NEON_REALTIME_SECRET` and `NEON_AUTH_BASE_URL` from `.env.local`, plus a `NEON_AUTH_COOKIE_SECRET` of at least 32 characters.

`npm run build` then `npm start` runs the production server. `npm start` loads `.env.local` if it exists.
