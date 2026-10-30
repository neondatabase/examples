import "server-only";

import { createRealtime } from "@neon/realtime/server";
import { drizzleAdapter } from "@neon/realtime-drizzle";

import { getEnv } from "./env";

let realtime: ReturnType<typeof create> | undefined;
function create() {
  const env = getEnv();
  return createRealtime({
    secret: env.realtimeSecret,
    db: env.database,
    adapter: drizzleAdapter(),
    debugMode: process.env.NODE_ENV === "development", // full database errors in dev only
  });
}
export const getRealtime = () => (realtime ??= create());
