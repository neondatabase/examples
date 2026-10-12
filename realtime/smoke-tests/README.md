# Realtime browser smoke tests

Run a configured example against its Neon project, then run this suite in a
second terminal. It creates temporary todos, checks both tabs for create,
complete, uncomplete, and delete events, waits beyond the sealed query's
60-second lifetime, and disconnects one tab to check recovery. Test rows are
removed afterward. Titles include quotes to check that mutation values round-trip
through each SQL or query-builder integration.

```sh
npm install
npx playwright install chromium
DEMO_URL=http://localhost:3001 npm test
```

Use `DEMO_URL=http://localhost:5173` for the Vite development servers and
`DEMO_URL=http://localhost:3000 DEMO_SSR=1` for Next.js or TanStack Start.
`DEMO_SSR=1` also verifies that initial rows render with JavaScript disabled.
`SMOKE_QUICK=1` checks mutations and optional SSR without the renewal and
reconnect checks, which is useful for a second check of development mode.
Optionally set `DEMO_FRAMEWORK` to the app's label (`Vanilla TypeScript`,
`React`, `React + Drizzle`, `React + Kysely`, `Next.js SSR`, or
`TanStack Start + DB`) to verify the target app.

An existing Chromium binary can be selected with
`PLAYWRIGHT_EXECUTABLE_PATH=/absolute/path/to/chromium`.
