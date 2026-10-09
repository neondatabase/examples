import { createRealtimeClient, type RealtimeClient } from "@neon/realtime/client";
import { drizzleParsers } from "@neon/realtime-drizzle/client";

// `vite.config.ts` exposes `NEON_REALTIME_URL` to both bundles, so the server
// can build a client for SSR seeding with the same URL the browser uses.
export function realtimeUrl(): string {
  const value = import.meta.env.NEON_REALTIME_URL;
  if (!value) throw new Error("Missing NEON_REALTIME_URL");
  return value;
}

// The browser creates exactly one of these, so every collection shares one
// WebSocket. The socket opens lazily on the first subscription.
// `drizzleParsers` makes live rows match the Drizzle `$inferSelect` types that
// SSR rows already have, such as `Date` timestamps and parsed JSON.
export function createLivebaseClient(): RealtimeClient {
  return createRealtimeClient({ url: realtimeUrl(), parsers: drizzleParsers });
}
