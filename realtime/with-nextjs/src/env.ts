import "server-only";

import { parseEnv } from "@neon/env";
import { parse as parsePostgresConnectionString } from "pg-connection-string";

import neonConfig from "../neon";

function loadEnv() {
  const env = parseEnv(neonConfig, [
    "DATABASE_URL",
    "NEON_REALTIME_URL",
    "NEON_REALTIME_SECRET",
  ]);
  const databaseName = parsePostgresConnectionString(
    env.postgres.databaseUrl,
  ).database;
  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name in its path.");
  }
  return {
    databaseUrl: env.postgres.databaseUrl,
    databaseName,
    realtimeUrl: env.realtime.url,
    realtimeSecret: env.realtime.secret,
  };
}

let cachedEnv: ReturnType<typeof loadEnv> | undefined;

/** Read runtime configuration lazily so `next build` does not require secrets. */
export const getEnv = () => (cachedEnv ??= loadEnv());
