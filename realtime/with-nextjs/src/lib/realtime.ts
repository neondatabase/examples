import "server-only";

import { createRealtime } from "@neon/realtime/server";
import { kyselyAdapter } from "@neon/realtime-kysely";

import { getEnv } from "./env";

let realtime: ReturnType<typeof create> | undefined;
function create() {
  const env = getEnv();
  return createRealtime({
    secret: env.realtimeSecret,
    db: env.database,
    adapter: kyselyAdapter(),
    debugMode: process.env.NODE_ENV === "development", // full database errors in dev only
  });
}
export const getRealtime = () => (realtime ??= create());
