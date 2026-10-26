import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

// Applies migrations/*.sql in name order, each in its own transaction, and
// records them in rollup.schema_migrations. An applied file that has since
// changed is an error: add a new migration instead of editing an old one.

const migrationsDir = new URL("../migrations/", import.meta.url);

// pg already treats sslmode=require as verify-full and warns that this will
// change; ask for verify-full explicitly so the connection stays verified.
function verifyFull(connectionString: string): string {
  const url = new URL(connectionString);
  const mode = url.searchParams.get("sslmode");
  if (mode === "prefer" || mode === "require" || mode === "verify-ca")
    url.searchParams.set("sslmode", "verify-full");
  return url.href;
}

export async function migrate(
  connectionString: string,
  log: (line: string) => void = console.log,
): Promise<void> {
  const client = new pg.Client({ connectionString: verifyFull(connectionString) });
  await client.connect();
  try {
    // One migrator at a time, even if two deploys overlap.
    await client.query("SELECT pg_advisory_lock(hashtext('neon-rollup-migrations'))");
    await client.query("CREATE SCHEMA IF NOT EXISTS rollup");
    await client.query(`CREATE TABLE IF NOT EXISTS rollup.schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(migrationsDir))
      .filter((file) => /^\d{3}_[a-z0-9_]+\.sql$/.test(file))
      .sort();
    for (const file of files) {
      const sql = await readFile(new URL(file, migrationsDir), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const applied = await client.query<{ checksum: string }>(
        "SELECT checksum FROM rollup.schema_migrations WHERE name = $1",
        [file],
      );
      if (applied.rowCount) {
        if (applied.rows[0].checksum !== checksum)
          throw new Error(`Migration ${file} changed after it was applied`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query(sql);
        await client.query(
          "INSERT INTO rollup.schema_migrations (name, checksum) VALUES ($1, $2)",
          [file, checksum],
        );
        await client.query("COMMIT");
        log(`Applied migration ${file}`);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

// `npm run migrate` applies migrations by hand, using DATABASE_URL_UNPOOLED.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL_UNPOOLED (run `neon env pull` first)");
    process.exit(1);
  }
  await migrate(url);
}
