import { parseEnv } from "@neon/env";
import { parse as parsePostgresConnectionString } from "pg-connection-string";

import neonConfig from "../neon";

// Start's Vite plugin loads `.env.local` in dev; `npm start` passes it to Node.
export const env = parseEnv(neonConfig, [
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

export const postgresDatabaseName = databaseName;
