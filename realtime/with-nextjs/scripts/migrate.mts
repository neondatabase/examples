// Creates this app's table: `npm run db:setup`. Node strips the types, so there's no build step.
import { Kysely, PostgresDialect, sql } from "kysely";
import { type Migration, Migrator } from "kysely/migration";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Missing DATABASE_URL. Run `neon deploy` (first time) or `neon env pull`.",
  );
}
// As in src/lib/env.ts (server-only, so not importable here): say verify-full to avoid pg's sslmode warning.
const url = new URL(process.env.DATABASE_URL);
const sslmode = url.searchParams.get("sslmode");
if (sslmode === "prefer" || sslmode === "require" || sslmode === "verify-ca")
  url.searchParams.set("sslmode", "verify-full");

// Append new migrations; never edit one that has run. The primary key is the replica identity Realtime needs.
// No foreign key to neon_auth."user": this app doesn't manage the neon_auth schema.
const migrations: Record<string, Migration> = {
  "0001_create_realtime_next_todos": {
    async up(db) {
      await db.schema
        .createTable("realtime_next_todos")
        .ifNotExists()
        .addColumn("id", "uuid", (c) => c.primaryKey())
        .addColumn("user_id", "uuid", (c) => c.notNull())
        .addColumn("title", "text", (c) => c.notNull())
        .addColumn("completed", "boolean", (c) => c.notNull().defaultTo(false))
        .addColumn("created_at", "timestamptz", (c) =>
          c.notNull().defaultTo(sql`now()`),
        )
        .execute();
      await db.schema
        .createIndex("realtime_next_todos_user_id_created_at_idx")
        .ifNotExists()
        .on("realtime_next_todos")
        .columns(["user_id", "created_at"])
        .execute();
    },
  },
};

const db = new Kysely<unknown>({
  dialect: new PostgresDialect({
    pool: new pg.Pool({ connectionString: url.toString(), max: 1 }),
  }),
});
const { error, results } = await new Migrator({
  db,
  provider: { getMigrations: async () => migrations },
}).migrateToLatest();
for (const r of results ?? []) console.log(`${r.status}: ${r.migrationName}`);
if (results?.length === 0) console.log("Up to date.");
await db.destroy();
if (error) {
  console.error(error);
  process.exitCode = 1;
}
