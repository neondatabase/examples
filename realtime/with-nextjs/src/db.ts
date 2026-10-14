import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getEnv } from "./env";

const globalDatabase = globalThis as typeof globalThis & {
  realtimeTodoPool?: Pool;
};

let database: ReturnType<typeof drizzle> | undefined;

export function getDb() {
  const pool = (globalDatabase.realtimeTodoPool ??= new Pool({
    connectionString: getEnv().databaseUrl,
    max: 5,
    min: 1,
  }));
  return (database ??= drizzle(pool));
}
