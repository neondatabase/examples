import { parseEnv } from "@neon/env";
import { parse as parsePostgresConnectionString } from "pg-connection-string";

import neonConfig from "../neon";
import { withVerifyFullSsl } from "./database-url";

// Start's Vite plugin loads `.env.local` in dev; `npm start` passes it to Node.
export const env = parseEnv(neonConfig, [
  "DATABASE_URL",
  "NEON_REALTIME_URL",
  "NEON_REALTIME_SECRET",
  "NEON_AUTH_BASE_URL",
]);

export const databaseUrl = withVerifyFullSsl(env.postgres.databaseUrl);

const databaseName = parsePostgresConnectionString(databaseUrl).database;
if (!databaseName) {
  throw new Error("DATABASE_URL must include a database name in its path.");
}

export const postgresDatabaseName = databaseName;

// Signs the Neon Auth session cookie. `neon env pull` doesn't write it.
const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;
if (!cookieSecret || cookieSecret.length < 32) {
  throw new Error(
    "NEON_AUTH_COOKIE_SECRET must be at least 32 characters. Generate one with:\n" +
      '  echo "NEON_AUTH_COOKIE_SECRET=$(openssl rand -base64 32)" >> .env.local',
  );
}

export const authCookieSecret = cookieSecret;
