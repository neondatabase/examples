import { createRealtimeClient } from "@neon/realtime/client";
import { drizzleParsers } from "@neon/realtime-drizzle/client";

export const client = createRealtimeClient({
  url: import.meta.env.VITE_NEON_REALTIME_URL,
  // Decodes dates and timestamps the way Drizzle does
  parsers: { ...drizzleParsers },
  logLevel: import.meta.env.DEV ? "debug" : "warn",
});
