<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Realtime TanStack DB app

A per-user todo app built with [TanStack Start](https://tanstack.com/start), [TanStack DB](https://tanstack.com/db), [Drizzle ORM](https://orm.drizzle.team), [Neon Realtime](https://neon.com/docs/realtime/overview) and [Neon Auth](https://neon.com/docs/neon-auth/overview).

- **SSR.** The first HTML already contains the signed-in user's todos.
- **Live.** In the browser, a TanStack DB live query reads a collection that Realtime keeps in sync with Postgres.
- **Optimistic writes.** Changes apply at once. A server function writes them to Postgres, and the change is confirmed when its transaction comes back over Realtime.
- **Auth.** Neon Auth, through a small TanStack Start adapter that ships with the example, and Neon's prebuilt sign-in UI.

## Project structure

```
my-app/
├── neon.ts                    # Neon policy: Neon Auth + Realtime allowedOrigins
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
    ├── auth.server.ts         # Neon Auth server, wired to Start's request and cookies
    ├── auth.functions.ts      # sessionMiddleware, requireUser, getSessionUser
    ├── auth-client.ts         # Browser auth client
    └── routes/
        ├── __root.tsx         # Session in beforeLoad, no-store headers
        ├── _authed.tsx        # Sign-in guard, header, sign-out
        ├── _authed/index.tsx  # Todos page
        ├── auth/$path.tsx     # Neon's AuthView (sign-in, sign-up, ...)
        └── api/auth/$.ts      # Proxy to Neon Auth
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

Provision the services in `neon.ts`. `neon deploy` turns on Realtime and Neon Auth for the branch, then writes `NEON_REALTIME_URL`, `NEON_REALTIME_SECRET` and `NEON_AUTH_BASE_URL` to `.env.local` next to `DATABASE_URL`. It doesn't host the app.

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
echo "NEON_AUTH_COOKIE_SECRET=$(openssl rand -base64 32)" >> .env.local
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

- Safari may reject Neon Auth's `__Secure-` cookies on `http://localhost`, so sign-in can fail without an error. Use Chrome or Firefox for local development.
- Localhost is a trusted Neon Auth domain by default. If sign-in from localhost is rejected, run `neon neon-auth domain allow-localhost enable`.

## How it works

1. **Router.** `getRouter()` creates a Realtime client and a TanStack DB `DbClient` that holds it. On the server it runs once per request, and its Realtime client never connects. In the browser there's one per page load.
2. **Session.** The root route's `beforeLoad` calls `getSessionUser`. The `_authed` layout sends signed-out visitors to `/auth/sign-in`.
3. **Loader.** `loadTodos()` checks the session and returns the user's rows plus a sealed copy of the same query. The loader seeds a `todos:<userId>` collection in the router's `DbClient` with those rows.
4. **Hydration.** `routerWithDbClient` snapshots that collection into the HTML and restores it in the browser before the first render. The page renders with rows and without a hydration mismatch.
5. **Live.** In the browser the collection subscribes to Realtime with the sealed query, and `useLiveQuery` reads it. `refreshTodosQuery` re-seals the query about every 50 seconds. Through a reconnect, or a refresh that lands after the query expired, the collection keeps its rows until Realtime sends the complete result again. The collection stays live for the life of the page (`gcTime: 0`), and the route doesn't refetch it when you navigate back (`staleTime: Infinity`).
6. **Writes.** Each optimistic transaction becomes one call to a POST server function (`createTodos`, `updateTodos` or `deleteTodos`). The function checks the session, validates the batch with zod, and writes it in one SQL statement limited to the user's rows. Its `RETURNING` clause includes `pg_current_xact_id()`, so the collection can wait up to 10 seconds for that transaction to arrive over Realtime (`awaitTxId`) without another database round trip. A failed write rolls back and shows the error. A write that committed but didn't arrive in time also rolls back, with a notice that it was saved, and shows again once live updates reconnect. A row's checkbox and Delete button stay disabled until its last change is confirmed. A write that changes nothing returns `{ txid: null }` and isn't rolled back.
7. **Sign-in and sign-out** are full page loads, which drop the `DbClient`, the socket and any cached rows. If the session is gone when the page refreshes its query or writes, it goes to `/auth/sign-in`. So does a query refresh or a write after another user signs in.

The `Todo` type is inferred from the `selectTodos` Drizzle query. The sealed query carries it into the collection and `useLiveQuery`.

## The Neon Auth adapter

Neon Auth has no official TanStack Start adapter yet, so the example ships a small one on `@neondatabase/auth/server`:

- `src/auth.server.ts` creates the auth server, wired to Start's request and `setCookie`.
- `src/auth.functions.ts` has `sessionMiddleware`, `requireUser` and the `getSessionUser` server function.
- `src/routes/api/auth/$.ts` proxies `/api/auth/*` to Neon Auth.

The sign-in UI is Neon's prebuilt `AuthView` in `src/routes/auth/$path.tsx`, the only file that imports `@neondatabase/auth-ui` and its CSS. Leaving that route is always a full page load, so the auth UI's styles don't reach the todos page. Both auth packages are beta and pinned exactly. Replace these files when an official adapter or `@neon/auth` ships.

## Security

- `NEON_REALTIME_SECRET` and `NEON_AUTH_COOKIE_SECRET` stay on the server. The browser gets sealed queries and the public WebSocket URL.
- A sealed query is a 60-second bearer token for one SQL query and its parameters. It isn't tied to a user: anyone holding it can subscribe until it expires. Pages carry rows and a sealed query, so they're sent with `Cache-Control: private, no-store`. Otherwise, rows and sealed queries only come from POST server functions.
- Users are kept apart only by the `WHERE user_id = …` that the server puts in the sealed query after checking the session. Realtime doesn't know who the user is.
- Every todo server function checks the session again with `requireUser`. The `_authed` redirect only shapes the UI. Writes never take `user_id` from the browser: the user id they send is only checked against the session.
- A session revoked elsewhere can look valid for up to 5 minutes, because server checks trust the session cookie cache (`sessionDataTtl`, 300 seconds by default).
- Server functions rely on Start's default CSRF middleware, which Start only installs when there's no `src/start.ts`. If you add one, add `createCsrfMiddleware` back.

## Deploying elsewhere

This template doesn't host the app. To run it on your own host:

1. Add the app's origin to `preview.realtime.allowedOrigins` in `neon.ts`, then apply it. Realtime rejects browsers from origins that aren't listed.

   ```bash
   neon deploy --update-existing
   ```

2. Trust the origin in Neon Auth:

   ```bash
   neon neon-auth domain add https://your-app.example.com
   ```

3. Build with `VITE_NEON_REALTIME_URL` set. Vite inlines it into the bundle at build time.
4. Give the server `DATABASE_URL`, `NEON_REALTIME_URL`, `NEON_REALTIME_SECRET` and `NEON_AUTH_BASE_URL` from `.env.local`, plus a `NEON_AUTH_COOKIE_SECRET` of at least 32 characters.

`npm run build` then `npm start` runs the production server. `npm start` loads `.env.local` if it exists.
