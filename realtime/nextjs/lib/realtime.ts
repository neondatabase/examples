import { createRealtime } from "@neon/realtime/server";
import { drizzleAdapter } from "@neon/realtime-drizzle";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Missing DATABASE_URL");

const secret = process.env.NEON_REALTIME_SECRET;
if (!secret) throw new Error("Missing NEON_REALTIME_SECRET");

export const realtime = createRealtime({
  secret,
  db: decodeURIComponent(new URL(databaseUrl).pathname.slice(1)),
  adapter: drizzleAdapter(),
});
