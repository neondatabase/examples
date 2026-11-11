import { Pool } from "pg";
import { connectionString } from "../lib/connection-string";

const databaseUrl =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Missing DATABASE_URL");
const pool = new Pool({ connectionString: connectionString(databaseUrl) });

try {
  const { rows } = await pool.query<{ wal_level: string }>("SHOW wal_level");
  if (rows[0]?.wal_level !== "logical") {
    throw new Error(
      "Realtime needs logical WAL. Run neon projects update <project-id> --enable-logical-replication --yes, then retry setup.",
    );
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS realtime_todos (
      id serial PRIMARY KEY,
      title text NOT NULL,
      status text NOT NULL CHECK (status IN ('active', 'completed'))
    )
  `);
  await pool.query("ALTER TABLE realtime_todos REPLICA IDENTITY FULL");
  await pool.query(`
    INSERT INTO realtime_todos (title, status)
    SELECT 'Open this app in another tab', 'active'
    WHERE NOT EXISTS (SELECT 1 FROM realtime_todos)
  `);
  console.log("Todo table is ready.");
} finally {
  await pool.end();
}
