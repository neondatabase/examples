import { createRealtime } from "@neon/realtime/server";
import { drizzleAdapter } from "@neon/realtime-drizzle";

import { databaseUrl } from "./db.server";

// Anyone with the secret can seal any query, so it must never reach the
// browser. Neon Realtime decrypts the sealed queries this server creates.
const secret = process.env.NEON_REALTIME_SECRET;
if (!secret) throw new Error("Missing NEON_REALTIME_SECRET");

// Sealed queries run against the database the app connects to: the URL's path,
// which is percent-encoded. The Realtime SDK rejects an empty name with a
// message that doesn't mention the URL, so check it here.
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
if (!databaseName) {
  throw new Error("DATABASE_URL has no database name. Put it after the host, as in postgresql://.../neondb");
}

export const realtime = createRealtime({
  secret,
  db: databaseName,
  adapter: drizzleAdapter(),
});
