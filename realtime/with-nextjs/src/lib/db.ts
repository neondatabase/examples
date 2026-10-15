import "server-only";

import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import { getEnv } from "./env";
import type { Database } from "./schema";

// One pool per server process; the globalThis slot survives dev hot reloads.
const slot = globalThis as typeof globalThis & { todosPool?: Pool };
let db: Kysely<Database> | undefined;

/** Lazy. No CamelCasePlugin (see schema.ts). */
export function getDb() {
  slot.todosPool ??= new Pool({
    connectionString: getEnv().databaseUrl,
    max: 5,
  });
  return (db ??= new Kysely<Database>({
    dialect: new PostgresDialect({ pool: slot.todosPool }),
  }));
}
