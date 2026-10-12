import "server-only";

import { createRealtime } from "@neon/realtime/server";
import { drizzleAdapter } from "@neon/realtime-drizzle";

import { env, postgresDatabaseName } from "./env";

export const realtime = createRealtime({
  secret: env.realtime.secret,
  db: postgresDatabaseName,
  adapter: drizzleAdapter(),
});
