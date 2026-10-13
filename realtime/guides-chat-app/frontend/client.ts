// From guides/subscribing.md "Subscribe to the sealed query" and "Log client diagnostics"
import { createRealtimeClient } from "@neon/realtime/client";
import { drizzleParsers } from "@neon/realtime-drizzle/client";

export const client = createRealtimeClient({
  url: import.meta.env.VITE_NEON_REALTIME_URL,
  parsers: { ...drizzleParsers },
  logLevel: import.meta.env.DEV ? "debug" : "warn",
});
