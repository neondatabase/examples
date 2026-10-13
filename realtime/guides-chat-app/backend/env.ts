// Checks the variables the backend reads, and takes
// the Realtime database name from DATABASE_URL.
import { parseEnv } from "@neon/env";
import { parse as parsePostgresConnectionString } from "pg-connection-string";

import neonConfig from "../neon";

const env = parseEnv(neonConfig, [
  "DATABASE_URL",
  "NEON_AUTH_BASE_URL",
  "NEON_REALTIME_URL",
  "NEON_REALTIME_SECRET",
]);

// Only the name is read, so libpq sslmode semantics are safe here and skip pg-connection-string's warning
const databaseName = parsePostgresConnectionString(env.postgres.databaseUrl, {
  useLibpqCompat: true,
}).database;
if (!databaseName) {
  throw new Error("DATABASE_URL must include a database name in its path.");
}

export const postgresDatabaseName = databaseName;
