import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import { withVerifyFullSsl } from "./database-url";

loadEnv({ path: ".env.local", quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL. Run `neon env pull` first.");
}

const pool = new Pool({
  connectionString: withVerifyFullSsl(process.env.DATABASE_URL),
});

try {
  // Keep the columns and the index in sync with src/schema.ts.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS realtime_todos (
      id uuid PRIMARY KEY,
      user_id text NOT NULL,
      title text NOT NULL,
      completed boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS realtime_todos_user_id_idx
      ON realtime_todos (user_id)
  `);
  console.log("Realtime todo table is ready.");
} finally {
  await pool.end();
}
