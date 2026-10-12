import "server-only";

import { createRealtime } from "@neon/realtime/server";
import { drizzleAdapter } from "@neon/realtime-drizzle";

import { env } from "./env";

export const realtime = createRealtime({
  secret: env.realtime.secret,
  db: env.realtime.databaseName,
  adapter: drizzleAdapter(),
});
