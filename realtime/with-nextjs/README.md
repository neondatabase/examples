<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Realtime Next.js app

A full-stack Next.js app with server-side rendering, live reactivity and optimistic mutations, using [Neon Auth](https://neon.com/docs/auth/overview), [Neon Realtime](https://neon.com/docs/realtime/overview) and [Drizzle](https://orm.drizzle.team).

The server renders each user's todos, the browser keeps the same query live over Realtime, and writes show at once, then stay pending until Postgres confirms them.

Start your own copy with:

```bash
neon bootstrap my-app --template realtime-nextjs
cd my-app
```

## Set up

```bash
npm install
neon login
neon link
```

Apply `neon.ts` to the linked branch. `neon deploy` enables Neon Auth and Realtime, then writes `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_REALTIME_URL` and `NEON_REALTIME_SECRET` to `.env.local` (plus `NEON_AUTH_JWKS_URL`, which this app doesn't use). It doesn't host the app.

```bash
neon deploy
```

Append a cookie secret to `.env.local`. Neon Auth uses it to sign the session cache cookie, and the pull doesn't write it. Run this once:

```bash
printf '\nNEON_AUTH_COOKIE_SECRET=%s\n' "$(openssl rand -base64 32)" >> .env.local
```

Create the `realtime_next_todos` table, then start the app:

```bash
npm run db:setup
npm run dev
```

To refresh the Neon variables later, for example after `neon checkout`, run `neon env pull`. It rewrites the keys it owns and keeps `NEON_AUTH_COOKIE_SECRET`. Don't copy `.env.example` over `.env.local`: that overwrites `DATABASE_URL`.

## Try it

Open <http://localhost:3000>. You're sent to `/auth/sign-in`. Sign up, and you land on an empty list.

- **Live.** Open a second tab as the same user. Add, complete or delete a todo in one tab. It shows dimmed at once, turns normal when Postgres confirms it, and appears in the other tab over Realtime.
- **Per user.** Sign up as a second user in a private window. That user sees none of the first user's todos.
- **SSR.** Reload with a few todos and view the source: the rows are in the HTML. The status goes from "Connecting…" to "Live" without moving the rows.

## How it works

The [SSR](https://neon.com/docs/realtime/guides/ssr), [reactivity](https://neon.com/docs/realtime/guides/reactivity) and [mutations](https://neon.com/docs/realtime/guides/mutations) guides explain the pattern. This is how the example applies it in the Next.js App Router.

- **Rendering per request.** `src/app/page.tsx` is a static shell. The list is the async `<Todos/>` Server Component in `src/app/todos.tsx`, inside `<Suspense>`. It calls `connection()` first, so it only runs at request time, and nothing caches the read or the seal: the sealed query is a 60-second bearer token for one user's data. `src/proxy.ts` sends signed-out page loads a real HTTP redirect, because a `redirect()` inside `<Suspense>` only happens in the browser.
- **One query, read and sealed together.** `src/lib/todos.ts` builds the live query in one place. `loadTodos()` runs it and seals it in parallel, and the list renders those rows straight away. The first live result replaces them. See [return the sealed query and initial results](https://neon.com/docs/realtime/guides/ssr#return-the-sealed-query-and-initial-results) and [render the initial rows straight away](https://neon.com/docs/realtime/guides/ssr#render-the-initial-rows-straight-away).

  ```tsx
  export async function Todos() {
    await connection();
    const user = await getUser();
    if (!user) redirect("/auth/sign-in"); // backstop: proxy.ts already redirected
    const { rows, sealedQuery } = await loadTodos(user.id);
    return (
      <RealtimeRoot
        key={sealedQuery.queryFingerprint}
        url={getEnv().realtimeUrl}
      >
        <TodoList initialTodos={rows} sealedQuery={sealedQuery} />
      </RealtimeRoot>
    );
  }
  ```

- **Keeping the subscription alive across re-renders.** [`useLiveQuery`](https://neon.com/docs/realtime/guides/reactivity#uselivequery) restarts its subscription when it gets a new sealed-query object, and that rejects every pending `awaitTxId()`. A server re-render sends one even when the query hasn't changed: `router.refresh()` (Neon Auth's UI calls it on every session change), a Server Action that revalidates or sets a cookie, or navigating to `/` from `/`. So the example follows three rules:
  1. `src/app/todo-list.tsx` keeps the first sealed query it gets (`useState(sealedQuery)`). Renewals go through `refreshQuery`, not new props.
  2. `<RealtimeRoot>` is keyed on `sealedQuery.queryFingerprint`, so a different query (another user, or a deploy that changed the SQL) remounts the list.
  3. Server Actions never call `revalidatePath`, `refresh()` or `updateTag`. The live query already delivers every write.
- **Renewal.** The sealed query expires after 60 seconds. `refreshQuery` re-seals it with a `POST` to the Route Handler in `src/app/api/todos/live-query/route.ts`, which checks the session and seals the same query. It's a Route Handler, not a Server Action, because Next.js runs Server Actions one at a time, so a renewal would queue behind pending writes. After a 401 it stops renewing and calls `router.refresh()`, so `proxy.ts` redirects to sign-in. See [renew from the server](https://neon.com/docs/realtime/guides/ssr#renew-from-the-server).
- **Writes.** `addTodo`, `setTodoCompleted` and `deleteTodo` in `src/app/actions.ts` check the session, validate their input with zod and scope the write to the user. They return the transaction id from `RETURNING pg_current_xact_id()::text` as `{ kind: "committed", txid }`, `{ kind: "unchanged" }` when nothing matched, or `{ kind: "rejected", reason }`. They don't throw for expected failures, because Next.js hides a thrown error's message in production. In the browser, `mutate` applies the change with `useOptimistic` and keeps the transition open until the transaction arrives on the stream. The browser creates each new todo's id, so the optimistic row and the live row match. See [with React's `useOptimistic` hook](https://neon.com/docs/realtime/guides/mutations#with-reacts-useoptimistic-hook).

  ```tsx
  function mutate(
    action: OptimisticAction,
    write: () => Promise<WriteResult>,
    failure: string,
  ) {
    setNotice(null);
    startTransition(async () => {
      updateOptimistically(action); // lasts exactly as long as this transition
      let result: WriteResult;
      try {
        result = await write();
      } catch {
        setNotice({ tone: "error", text: failure }); // the change rolls back
        return;
      }
      if (result.kind === "rejected") {
        // Signed out: refresh, and proxy.ts redirects to sign-in.
        if (result.reason === "UNAUTHENTICATED") router.refresh();
        else setNotice({ tone: "error", text: failure });
        return;
      }
      if (result.kind === "unchanged") return; // nothing to wait for
      try {
        await utils.awaitTxId(result.txid, SYNC_TIMEOUT_MS); // the live data now contains the write
      } catch {
        setNotice({
          tone: "info",
          text: "Saved. It will appear when live updates reconnect.",
        });
      }
    });
  }
  ```

## Auth and isolation

- Realtime has no row-level security. Users are kept apart only by the `WHERE user_id = …` that the server puts in the sealed query after checking the session, and by `AND user_id = …` on every write. `user_id` never comes from the browser. See [authorization](https://neon.com/docs/realtime/guides/queries#authorization).
- `src/proxy.ts` isn't the security boundary. It only redirects page loads. `<Todos/>`, every Server Action and the renewal route call `getUser()` themselves.
- `NEON_REALTIME_SECRET` and `NEON_AUTH_COOKIE_SECRET` stay on the server (`import "server-only"`). The browser gets sealed queries and the public WebSocket URL, passed as a prop.
- A user whose session is revoked elsewhere can keep seeing live updates for up to about 6 minutes: up to 5 minutes of Neon Auth's session cookie cache, plus the sealed query's 60 seconds.

## Project layout

```
realtime/with-nextjs/
├── neon.ts                              # Neon policy: Neon Auth, Realtime allowedOrigins
├── drizzle.config.ts                    # drizzle-kit, reads .env.local
├── .env.example                         # Every variable, and where it comes from
└── src/
    ├── proxy.ts                         # Neon Auth middleware: HTTP redirect for signed-out loads of /
    ├── lib/
    │   ├── env.ts                       # Lazy, validated server env; database name from DATABASE_URL
    │   ├── schema.ts                    # realtime_next_todos table
    │   ├── db.ts                        # Lazy pg pool + Drizzle
    │   ├── realtime.ts                  # Lazy Realtime server, seals queries
    │   ├── todos.ts                     # The one live query: loadTodos, sealTodos, TodoRow
    │   └── auth/
    │       ├── server.ts                # getAuth, getUser
    │       └── client.ts                # Browser auth client
    └── app/
        ├── layout.tsx                   # Root layout, wraps the app in <Providers>
        ├── providers.tsx                # Neon Auth UI provider
        ├── page.tsx                     # Static shell: header, <UserButton/>, <Suspense><Todos/></Suspense>
        ├── todos.tsx                    # Async Server Component: session, read, seal
        ├── realtime-root.tsx            # Realtime client and provider
        ├── todo-list.tsx                # Live list, optimistic writes, status
        ├── local-time.tsx               # Dates in the browser's locale after hydration
        ├── actions.ts                   # Server Actions: addTodo, setTodoCompleted, deleteTodo
        ├── error.tsx                    # Error boundary
        ├── globals.css                  # Tailwind and the Neon Auth UI styles
        ├── auth/[path]/page.tsx         # Prebuilt sign-in, sign-up and account pages
        └── api/
            ├── auth/[...path]/route.ts  # Neon Auth handler
            └── todos/live-query/route.ts # POST: renew the sealed query
```

## Deploy

`neon deploy` doesn't host the app. To run it on your own Node host:

- Set `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_REALTIME_URL`, `NEON_REALTIME_SECRET` and `NEON_AUTH_COOKIE_SECRET` on the host.
- Add the app's origin to `preview.realtime.allowedOrigins` in `neon.ts`, then run `neon deploy`.
- Add the domain to Neon Auth's [trusted domains](https://neon.com/docs/auth/guides/configure-domains): `neon neon-auth domain add https://your-app.example.com`.
- `npm run build` needs no env, so you can build without secrets. `npm start` runs the production server.
- If the app runs on more than one instance, set the same `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` on each, so a Server Action from one instance works on another.

## Turning on `cacheComponents`

Set `cacheComponents: true` in `next.config.ts`, and remove `export const dynamicParams = false` from `src/app/auth/[path]/page.tsx`. `<Todos/>` already reads the session inside `<Suspense>`, so it needs no other change. With the flag on, a page that Next.js hides and shows again briefly shows the original server rows before the live rows return.

## Troubleshooting

- **Stuck on "Connecting…".** The page's origin isn't in `allowedOrigins` in `neon.ts`. Realtime doesn't report this as an error. Check that Next.js started on port 3000, not 3001 because 3000 was busy. To allow another origin, add it and run `neon deploy`.
- **`NEON_AUTH_COOKIE_SECRET must be at least 32 characters`.** The secret is missing from `.env.local` or too short. Append it with the `printf` command in [Set up](#set-up), then restart `npm run dev`.
- **`neon env pull` fails on a new branch.** Neon Auth and Realtime aren't enabled until `neon deploy` applies `neon.ts`. Run `neon deploy` first.

## Known limitations

- The stream doesn't resume from the server-rendered rows, so they're sent again on connect.
- The sealed query lasts a fixed 60 seconds, and Realtime has no row-level security.
- After a failed renewal, `useLiveQuery` retries every second.
- Reconnect reloads the page. There's no client reset yet.
- A write made during a stream outage of more than 5 minutes disappears from the list until the stream reconnects.
