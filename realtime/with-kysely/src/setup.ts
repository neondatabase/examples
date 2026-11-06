import "./load-env.js";

import { Kysely, PostgresDialect } from "kysely";

import { pool } from "./db.js";
import type { Database } from "./schema.js";

const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

try {
  await db.schema
    .createTable("realtime_todos")
    .ifNotExists()
    .addColumn("id", "serial", (column) => column.primaryKey())
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("completed", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .execute();

  // Seed one row only when the table is empty, so re-running stays idempotent.
  const existing = await db
    .selectFrom("realtime_todos")
    .select("id")
    .limit(1)
    .executeTakeFirst();
  if (!existing) {
    await db
      .insertInto("realtime_todos")
      .values({ title: "Open this app in another tab" })
      .execute();
  }

  console.log("Realtime todo table is ready.");
} finally {
  await pool.end();
}
