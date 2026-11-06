import "server-only";

import { parseEnv } from "@neon/env";
import { parse as parseConnectionString } from "pg-connection-string";

import neonConfig from "../../neon";

function load() {
  const env = parseEnv(neonConfig, [
    "DATABASE_URL",
    "NEON_AUTH_BASE_URL",
    "NEON_REALTIME_URL",
    "NEON_REALTIME_SECRET",
  ]);
  // Not written by `neon env pull`: the app owns this secret (it signs the session cache cookie).
  const authCookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!authCookieSecret || authCookieSecret.length < 32) {
    throw new Error(
      "NEON_AUTH_COOKIE_SECRET must be at least 32 characters. Append it to .env.local: " +
        "printf '\\nNEON_AUTH_COOKIE_SECRET=%s\\n' \"$(openssl rand -base64 32)\" >> .env.local",
    );
  }
  // pg already treats prefer/require/verify-ca as verify-full. Say so explicitly to avoid
  // pg's deprecation warning, which Next replays in the browser console.
  const url = new URL(env.postgres.databaseUrl);
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode === "prefer" || sslmode === "require" || sslmode === "verify-ca")
    url.searchParams.set("sslmode", "verify-full");
  const databaseUrl = url.toString();
  // Realtime must target the same database as DATABASE_URL, so derive the name instead of configuring it.
  const database = parseConnectionString(databaseUrl).database;
  if (!database)
    throw new Error("DATABASE_URL must include a database name in its path.");
  return {
    databaseUrl,
    database,
    authBaseUrl: env.auth.baseUrl,
    authCookieSecret,
    realtimeUrl: env.realtime.url, // public WebSocket endpoint, passed to the browser as a prop
    realtimeSecret: env.realtime.secret, // server-only: seals live queries
  };
}

let cached: ReturnType<typeof load> | undefined;
/** Lazy: importing this module reads nothing, so `next build` needs no env. */
export const getEnv = () => (cached ??= load());
