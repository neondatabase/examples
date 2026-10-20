<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Realtime React Native app

A shared todo app built with React Native, Expo, Hono RPC, Drizzle, and Neon
Realtime. Writes are applied optimistically on the current device and then
streamed to every other connected client.

You can start your own copy with:

```bash
neon bootstrap my-app --template realtime-react-native
```

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

If provisioning takes longer than the command's readiness window, run:

```bash
neon env pull --service postgres --service realtime
```

Create and seed the todo table:

```bash
npm run db:setup
```

## Run the app

Start the API in one terminal:

```bash
npm run dev:server
```

Then start Expo in another terminal:

```bash
npm run ios
```

Use `npm run android` for Android. The iOS simulator reaches the API through
`127.0.0.1`; the Android emulator uses `10.0.2.2`.

React Native supplies an endpoint-derived WebSocket origin by default. This
example overrides it with `http://localhost:5173`, matching the origin allowed
by `neon.ts` and the sibling browser example. For a deployed browser companion,
set `EXPO_PUBLIC_REALTIME_ORIGIN` to its allowed HTTPS origin.

For a physical device, append `EXPO_PUBLIC_API_URL` with your computer's LAN
address to the existing `.env.local`, then restart Expo:

```bash
EXPO_PUBLIC_API_URL="http://192.168.1.100:3001"
```

The device and computer must be on the same network, and the firewall must
allow port 3001. Use HTTPS when adapting the example for a deployed app.

## Test synchronization with the React example

The app uses the same `realtime_todos` table and API contract as the sibling
`realtime/with-react` example. Point both examples at the same Neon branch,
start this example's API, and start only the React example's Vite client:

```bash
cd ../with-react
npx vite
```

Open <http://localhost:5173>. Adding, completing, or deleting a todo on either
the phone or the browser appears in the other client through Neon Realtime.

The backend keeps `NEON_REALTIME_SECRET` private. It seals the Drizzle query and
returns only the sealed query and public WebSocket URL to the app. This demo
does not authenticate its API routes; add authorization before adapting it for
a production application.
