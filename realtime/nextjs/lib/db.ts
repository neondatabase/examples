import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { connectionString } from "./connection-string";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Missing DATABASE_URL");

const globalDatabase = globalThis as typeof globalThis & { todoPool?: Pool };
export const pool =
  globalDatabase.todoPool ??
  new Pool({ connectionString: connectionString(databaseUrl) });
if (process.env.NODE_ENV !== "production") globalDatabase.todoPool = pool;

export const db = drizzle(pool);
