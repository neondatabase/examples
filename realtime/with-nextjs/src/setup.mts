import "./lib/load-env";

import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Missing DATABASE_URL. Run `neon deploy` (first time) or `neon env pull`.",
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  // Keep the columns and the index in sync with src/lib/schema.ts.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS realtime_next_todos (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL,
      title text NOT NULL,
      completed boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS realtime_next_todos_user_id_created_at_idx
      ON realtime_next_todos (user_id, created_at)
  `);
  console.log("Realtime todo table is ready.");
} finally {
  await pool.end();
}
