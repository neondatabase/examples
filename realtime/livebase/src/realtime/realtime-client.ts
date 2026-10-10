import {
  createRealtimeClient,
  type RealtimeClient,
  type RealtimeLogEntry,
} from "@neon/realtime/client";
import { drizzleParsers } from "@neon/realtime-drizzle/client";

// `vite.config.ts` inlines `VITE_NEON_REALTIME_URL` into both bundles at build
// time, so one build serves one Neon branch. Rebuild after changing it.
export function realtimeUrl(): string {
  const value = import.meta.env.VITE_NEON_REALTIME_URL;
  if (!value) throw new Error("Missing VITE_NEON_REALTIME_URL");
  return value;
}

// One client per `DbClient` (see `router.tsx`), so every collection and the
// connection probe share one WebSocket. The socket opens on the first
// subscription. The server-side instance never subscribes, so it never connects.
// `drizzleParsers` makes live rows match the Drizzle `$inferSelect` types that
// SSR rows already have, such as `Date` timestamps and parsed JSON.
// `onEntry` receives the client's diagnostics, which need a logger to be seen.
export function createLivebaseClient(onEntry?: (entry: RealtimeLogEntry) => void): RealtimeClient {
  return createRealtimeClient({
    url: realtimeUrl(),
    parsers: drizzleParsers,
    // Warnings and errors in production: `connection_failed`,
    // `query_expired`, `subscription_renewal_failed`. Info adds connection
    // lifecycle in the browser in development. The server's clients never
    // connect, so their only info entry is `client_closed` when the SSR loader
    // closes one, once per page load. `debug` is too noisy for either.
    logLevel: import.meta.env.DEV && !import.meta.env.SSR ? "info" : "warn",
    // A custom logger replaces the SDK's console output, so print here.
    logger: (entry) => {
      console[entry.level](entry);
      onEntry?.(entry);
    },
  });
}
