import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Reads `DATABASE_URL` once. The pool and the Realtime SDK's database name both
// derive from it. Importing this module throws without it.
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("Missing DATABASE_URL. Copy .env.example to .env, or export it before starting Livebase.");
}
export const databaseUrl = url;

// Vite re-evaluates server modules on every edit in development. Caching the
// pool on globalThis keeps one set of connections instead of leaking a new
// pool per reload.
const globalDatabase = globalThis as typeof globalThis & { livebasePool?: Pool };
export const pool = globalDatabase.livebasePool ?? new Pool({ connectionString: databaseUrl });
if (process.env.NODE_ENV !== "production") globalDatabase.livebasePool = pool;

export const db = drizzle(pool);

export type Db = typeof db;
// The handle passed to `db.transaction(async (tx) => ...)`. Mutations run in
// one so that they can return the transaction ID (see `txid.server.ts`).
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
