<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Realtime guides chat app

The chat app that runs through the [Neon Realtime guides](https://neon.com/docs/realtime/guides/queries), as one working project. Users sign in with Neon Auth and read the channels they belong to. A Hono API verifies the Neon Auth JWT, seals Drizzle live queries that join through channel membership, and writes each message in a transaction that returns its txid. In React, one view binds a sealed query per channel with `useLiveQuery` and `useOptimistic`. The other syncs every channel into a TanStack DB collection and writes through it. Each file names the guide section it comes from.

## Set up

You need Node.js 22 or later and the [Neon CLI](https://neon.com/docs/cli/install), logged in:

```bash
npm i -g neon
neon login
```

Use Neon CLI 8.4.1 or newer so `neon.ts` can declare `realtime` and `neon subscribe` is available.

You also need a Neon project in a [region that supports Realtime](https://neon.com/docs/realtime/overview#which-regions-is-it-enabled-in): `aws-us-east-1`, `aws-us-east-2`, `aws-eu-central-1` or `aws-ap-southeast-1`. Realtime isn't available on [Claimable projects](https://neon.com/docs/reference/claimable-neon) until they're claimed.

If you scaffolded this app with `neon bootstrap`, it has already linked a project and installed the dependencies, so start at `neon deploy`.

Link the directory to your project:

```bash
neon link
```

`neon link` may warn that it couldn't pull the env vars, because Neon Auth and Realtime aren't enabled on the branch yet. `neon deploy` enables them below.

Install the dependencies:

```bash
npm install
```

Deploy the `neon.ts` policy. It enables Neon Auth and Realtime on the branch, and allows `http://localhost:5173` to open Realtime connections. The deploy waits for both, then writes the env vars that `.env.example` lists to `.env.local`. The app reads `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_REALTIME_URL` and `NEON_REALTIME_SECRET`:

```bash
neon deploy
```

If Realtime isn't ready before the deploy stops waiting, pull the env vars once it is:

```bash
neon env pull
```

`vite.config.ts` passes `NEON_AUTH_BASE_URL` and `NEON_REALTIME_URL` to the browser as the `VITE_NEON_AUTH_URL` and `VITE_NEON_REALTIME_URL` the guides use, so you don't set those yourself. `NEON_REALTIME_SECRET` stays on the server.

Create the tables, set `REPLICA IDENTITY FULL` on them, and add the support bot to channel 2:

```bash
npm run db:setup
```

Run the Hono API and the Vite dev server:

```bash
npm run dev
```

Open <http://localhost:5173>. Use `localhost`, not `127.0.0.1`: it's the only origin `neon.ts` allows.

Optionally, check a live query from the CLI in another terminal. This is the SQL of the guides' `messagesQuery()`, for the support bot in channel 2:

```bash
neon subscribe "SELECT messages.id, messages.channel_id, messages.author_id, messages.body, messages.created_at FROM messages INNER JOIN channel_members ON channel_members.channel_id = messages.channel_id WHERE channel_members.user_id = 'support-bot' AND messages.channel_id = 2 ORDER BY messages.created_at DESC LIMIT 50"
```

It prints the result again each time it changes, until you stop it with Ctrl+C. Send a message in `#support` in the app, or insert one from another terminal:

```bash
neon psql -- -c "INSERT INTO messages (id, channel_id, author_id, body) VALUES (gen_random_uuid(), 2, 'support-bot', 'Hello from psql')"
```

## Deploy

`neon deploy` only applies `neon.ts` here: it enables Neon Auth and Realtime and writes `.env.local`. Neon doesn't host this frontend, so the app runs locally with `npm run dev`. `neon dev` doesn't apply either, because `neon.ts` declares no functions.

For a hosted version, run the Hono API on Neon Functions and host the SPA on Vercel, as the [Realtime counter example](https://github.com/neondatabase/examples/tree/main/with-realtime-sse) does. Then add the deployed origin to `allowedOrigins` in `neon.ts` and to Neon Auth's [trusted domains](https://neon.com/docs/auth/guides/configure-domains).

## Try it with two users

Tabs in one browser window share Neon Auth's session cookie, so they're the same user. Use two browser sessions: a normal window and a private window.

1. Open <http://localhost:5173> in the normal window. It sends you to the sign-in page. Sign up a user.
2. Open the same URL in the private window and sign up a second user.

Then, in either window:

- On first load, each user joins `#general`, `#support` and `#random`. `#support` is selected: it's channel 2, the channel the guides use.
- The page shows the selected channel in two views: "useLiveQuery + useOptimistic" and "TanStack DB inbox".
- Send a message in either view. It shows straight away in that view, dimmed until its transaction syncs. Then it arrives live in the other view, and in both views in the other window.
- Edit and Delete show on your own messages. Edit asks for the new text. Both are disabled while the message is pending, and their changes show up the same way as a new message.
- Switch channels. The "useLiveQuery + useOptimistic" view fetches a new sealed query for the channel. The inbox view filters the rows it has already synced, so it makes no request.
- Sign out from the avatar menu.

In another terminal, run the worker. It subscribes from trusted backend code as the support bot, and logs each snapshot of channel 2's messages (status and rows) as it changes. Send a message in `#support` to see a new log. Stop it with Ctrl+C:

```bash
npm run worker
```

## Map to the guides

| Guide section                                                                                                                                                                                                                                   | File                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Defining queries: Setup](https://neon.com/docs/realtime/guides/queries#setup)                                                                                                                                                                  | `backend/schema.ts`, `backend/db.ts`                                                   |
| [Defining queries: Table requirements](https://neon.com/docs/realtime/guides/queries#table-requirements)                                                                                                                                        | `backend/setup.ts` (`REPLICA IDENTITY FULL`)                                           |
| [Defining queries: Using a query builder or ORM](https://neon.com/docs/realtime/guides/queries#using-a-query-builder-or-orm)                                                                                                                    | `backend/realtime.ts`, `backend/queries.ts` (`messagesQuery`)                          |
| [Defining queries: Exposing an endpoint](https://neon.com/docs/realtime/guides/queries#exposing-an-endpoint)                                                                                                                                    | `backend/auth.ts`, `backend/server.ts` (`POST /api/v1/messages/live`)                  |
| [Subscribing to queries: Fetch from an API endpoint](https://neon.com/docs/realtime/guides/subscribing#fetch-from-an-api-endpoint)                                                                                                              | `frontend/auth.ts`, `frontend/api.ts`                                                  |
| [Subscribing to queries: Subscribe to the sealed query](https://neon.com/docs/realtime/guides/subscribing#subscribe-to-the-sealed-query) and [Log client diagnostics](https://neon.com/docs/realtime/guides/subscribing#log-client-diagnostics) | `frontend/client.ts`                                                                   |
| [Subscribing to queries: Show full database errors](https://neon.com/docs/realtime/guides/subscribing#show-full-database-errors)                                                                                                                | `backend/realtime.ts` (`debugMode`)                                                    |
| [Client-side reactivity: RealtimeProvider](https://neon.com/docs/realtime/guides/reactivity#realtimeprovider)                                                                                                                                   | `frontend/main.tsx`                                                                    |
| [Client-side reactivity: useLiveQuery](https://neon.com/docs/realtime/guides/reactivity#uselivequery)                                                                                                                                           | `frontend/components/Messages.tsx`, `frontend/components/LocalTime.tsx`                |
| [Client-side reactivity: Changing query parameters](https://neon.com/docs/realtime/guides/reactivity#changing-query-parameters)                                                                                                                 | `frontend/components/Channel.tsx`                                                      |
| [Client-side reactivity: Seal a broader query](https://neon.com/docs/realtime/guides/reactivity#seal-a-broader-query)                                                                                                                           | `backend/queries.ts` (`inboxQuery`), `backend/server.ts` (`POST /api/v1/inbox/live`)   |
| [Client-side reactivity: Create the collection](https://neon.com/docs/realtime/guides/reactivity#create-the-collection)                                                                                                                         | `frontend/api.ts` (`fetchSealedInbox`), `frontend/collections.ts`, `frontend/main.tsx` |
| [Client-side reactivity: Query the collection](https://neon.com/docs/realtime/guides/reactivity#query-the-collection)                                                                                                                           | `frontend/components/Inbox.tsx`                                                        |
| [Optimistic mutations: Returning the txid from your backend](https://neon.com/docs/realtime/guides/mutations#returning-the-txid-from-your-backend)                                                                                              | `backend/server.ts` (`POST`, `PATCH` and `DELETE` on `/api/v1/messages`)               |
| [Optimistic mutations: Calling the routes from the frontend](https://neon.com/docs/realtime/guides/mutations#calling-the-routes-from-the-frontend)                                                                                              | `frontend/api.ts`                                                                      |
| [Optimistic mutations: Shared mutation helpers](https://neon.com/docs/realtime/guides/mutations#shared-mutation-helpers)                                                                                                                        | `frontend/mutations.ts`                                                                |
| [Optimistic mutations: With React's useOptimistic hook](https://neon.com/docs/realtime/guides/mutations#with-reacts-useoptimistic-hook)                                                                                                         | `frontend/components/Messages.tsx`, `frontend/components/Channel.tsx`                  |
| [Optimistic mutations: With TanStack DB collections](https://neon.com/docs/realtime/guides/mutations#with-tanstack-db-collections)                                                                                                              | `frontend/collections.ts`, `frontend/components/Inbox.tsx`, `frontend/main.tsx`        |

Where several sections show the same file, it combines them. The guides put the React components in `frontend/`. Here they're in `frontend/components/`, because the guides' `frontend/Messages.tsx` and `frontend/messages.ts` would clash on a case-insensitive filesystem.

The guides leave out sign-in, joining channels, loading `.env.local`, starting the server and setting up the tables. The code for those says it isn't from the guides. So does the app shell, `frontend/components/ChatApp.tsx`.

## Alternatives

These files hold the guides' other versions of the same code. The app doesn't import them, and `npm run typecheck` checks them. Only the worker runs on its own.

| File                                     | Guide section                                                                                                                                                                                                                                   | Notes                                                                                                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/queries-raw.ts`                 | [Defining queries: Using raw SQL](https://neon.com/docs/realtime/guides/queries#using-raw-sql)                                                                                                                                                  | To try it, in `backend/server.ts` import `messagesQuery` from `./queries-raw` and keep `inboxQuery` from `./queries`. The Drizzle server seals `rawSql` queries too, with the same `Message` rows. |
| `backend/realtime-raw.ts`                | [Defining queries: Using raw SQL](https://neon.com/docs/realtime/guides/queries#using-raw-sql)                                                                                                                                                  | Typechecked only. A server with no adapter, which seals only `rawSql` queries.                                                                                                                     |
| `backend/recent-messages.ts`             | [Defining queries: Parameter types](https://neon.com/docs/realtime/guides/queries#parameter-types)                                                                                                                                              | Typechecked only. `messagesSinceQuery()` takes a `Date` and passes it with `pgParam.timestamptz()`.                                                                                                |
| `backend/worker.ts`                      | [Subscribing to queries: Subscribe in trusted backend code](https://neon.com/docs/realtime/guides/subscribing#subscribe-in-trusted-backend-code)                                                                                                | Runs with `npm run worker`. See [Try it with two users](#try-it-with-two-users).                                                                                                                   |
| `frontend/app.ts`, `frontend/renewal.ts` | [Subscribing to queries: Subscribe to the sealed query](https://neon.com/docs/realtime/guides/subscribing#subscribe-to-the-sealed-query) and [Renew the sealed query](https://neon.com/docs/realtime/guides/subscribing#renew-the-sealed-query) | Typechecked only. The guide shows no page; run it in a page with `<p id="status">` and `<ul id="messages">`.                                                                                       |
| `frontend/raw-messages.ts`               | [Subscribing to queries: Listen for changes](https://neon.com/docs/realtime/guides/subscribing#listen-for-changes)                                                                                                                              | Typechecked only. A `materialize: false` subscription that keeps rows by `rowId` with `onReset` and `onBatch`.                                                                                     |
| `frontend/messages.ts`                   | [Optimistic mutations: Without a framework](https://neon.com/docs/realtime/guides/mutations#without-a-framework)                                                                                                                                | Typechecked only. `optimisticMessages()` takes the subscription from `frontend/app.ts` and a render function, in place of `subscription.onChange(render)`.                                         |

## Not included

- Server-side rendering, Next.js and TanStack Start. The [Server-side rendering guide](https://neon.com/docs/realtime/guides/ssr) covers them, with the [Next.js](https://neon.com/docs/realtime/examples/nextjs) and [TanStack](https://neon.com/docs/realtime/examples/tanstack) examples.
- The TanStack Start auth middleware and server functions from [Defining queries: Using server functions](https://neon.com/docs/realtime/guides/queries#using-server-functions).
