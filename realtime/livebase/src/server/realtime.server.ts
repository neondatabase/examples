import { createRealtime } from "@neon/realtime/server";
import { drizzleAdapter } from "@neon/realtime-drizzle";

// Anyone with the secret can seal any query, so it must never reach the
// browser. Neon Realtime decrypts the sealed queries this server creates.
const secret = process.env.NEON_REALTIME_SECRET;
if (!secret) throw new Error("Missing NEON_REALTIME_SECRET");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Missing DATABASE_URL");

export const realtime = createRealtime({
  secret,
  // Sealed queries run against the database the app connects to.
  db: new URL(databaseUrl).pathname.slice(1),
  adapter: drizzleAdapter(),
});
