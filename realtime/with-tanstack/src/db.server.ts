import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { databaseUrl } from "./env.server";

const globalDatabase = globalThis as typeof globalThis & {
  realtimeTodoPool?: Pool;
};

const pool =
  globalDatabase.realtimeTodoPool ??
  new Pool({
    connectionString: databaseUrl,
    max: 5,
    min: 1,
  });

if (process.env.NODE_ENV !== "production") {
  globalDatabase.realtimeTodoPool = pool;
}

export const db = drizzle(pool);
