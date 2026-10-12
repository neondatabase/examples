# Neon Realtime examples

Six independent todo apps demonstrate the managed Neon Realtime service.
Each app seals a SQL query on its backend; the browser sends the resulting
short-lived query capability to the managed WebSocket endpoint. Vanilla and
React use raw SQL, while the other examples build queries with Drizzle or
Kysely. Neon provisions the database and Realtime service.

| Example                                 | Integration                                                   | Development URL       |
| --------------------------------------- | ------------------------------------------------------------- | --------------------- |
| [Vanilla TypeScript](./vanilla)         | Raw SQL, low-level subscriptions and explicit query renewal   | http://localhost:5173 |
| [React](./react)                        | Raw SQL with `RealtimeProvider` and `useLiveQuery()`          | http://localhost:5173 |
| [React + Drizzle](./drizzle)            | Drizzle schema, queries and mutations with React live queries | http://localhost:5173 |
| [React + Kysely](./kysely)              | Typed Kysely queries and mutations with React live queries    | http://localhost:5173 |
| [Next.js](./nextjs)                     | Drizzle, server-rendered initial data and React live queries  | http://localhost:3000 |
| [TanStack Start + DB](./tanstack-start) | Drizzle, SSR collection hydration and optimistic mutations    | http://localhost:3000 |

Run one example at a time to avoid overlapping development ports. Each has its
own `package.json`, setup scripts, and documented `.env.local` configuration.
Use a separate Neon project for each example. The three React apps use the
same schema and UI so their database integrations are easy to compare.

## Setup

Each example includes a `neon.ts` policy that enables Realtime and declares
allowed browser origins. Its README covers PG18 project creation with the
Neon CLI, logical replication, linking, `neon config plan`, `neon deploy`, and
`neon env pull`. It also documents `neon realtime enable` for direct branch
configuration and the public URL needed by its frontend.

Each app keeps the sealing secret on its server and exposes only the managed
WebSocket URL to the browser. These todo demos have public mutation and sealing
endpoints; adding application authentication is outside their scope.

## Origin and capability lifecycle

Allow each app's development and deployment origins when enabling Realtime.
The returned HTTPS invocation URL becomes the WebSocket URL by changing
`https://` to `wss://`; no `/v1` suffix is added. The SDK negotiates
`neon.realtime.v1`.

Sealed queries expire after 60 seconds. Vanilla schedules renewal using the
SDK's millisecond expiry timestamp; React and TanStack DB use `refreshQuery`.
The TanStack mutation handlers capture `pg_current_xact_id()` inside the same
transaction as the write, then wait for its committed changes in the live
collection.

## Browser checks

The [smoke suite](./smoke-tests) exercises two-tab mutations, query renewal
past the original 60-second lifetime, and reconnect recovery against a real
Neon project. It can also check initial SSR rows with JavaScript disabled.
