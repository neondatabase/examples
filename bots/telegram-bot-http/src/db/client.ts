import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDatabaseUrl } from "../env.js";

const PG_ADMIN_SHUTDOWN = "57P01";
const IDLE_DISCONNECT_CODES = new Set(["ECONNRESET", "EPIPE", "ETIMEDOUT", PG_ADMIN_SHUTDOWN]);

function isIdleDisconnect(err: Error): boolean {
  const code = "code" in err && typeof err.code === "string" ? err.code : undefined;
  return (
    (code !== undefined && IDLE_DISCONNECT_CODES.has(code)) ||
    err.message === "Connection terminated unexpectedly"
  );
}

const createDb = (databaseUrl: string) => {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  pool.on("error", (err) => {
    if (!isIdleDisconnect(err)) console.error(err);
  });

  return drizzle(pool);
};

let db: ReturnType<typeof createDb> | undefined;

export const getDb = () => {
  db ??= createDb(getDatabaseUrl());

  return db;
};
