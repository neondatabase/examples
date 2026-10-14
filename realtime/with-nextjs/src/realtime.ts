import "server-only";

import { createRealtime } from "@neon/realtime/server";
import { drizzleAdapter } from "@neon/realtime-drizzle";

import { getEnv } from "./env";

let realtime: ReturnType<typeof createRealtime> | undefined;

export function getRealtime() {
  const env = getEnv();
  return (realtime ??= createRealtime({
    secret: env.realtimeSecret,
    db: env.databaseName,
    adapter: drizzleAdapter(),
  }));
}
