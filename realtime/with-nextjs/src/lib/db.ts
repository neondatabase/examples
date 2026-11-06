import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getEnv } from "./env";

// One pool per server process; the globalThis slot survives dev hot reloads.
const slot = globalThis as typeof globalThis & { todosPool?: Pool };
let db: ReturnType<typeof drizzle> | undefined;

/** Lazy. Columns stay snake_case (see schema.ts). */
export function getDb() {
  slot.todosPool ??= new Pool({
    connectionString: getEnv().databaseUrl,
    max: 5,
  });
  return (db ??= drizzle(slot.todosPool));
}
