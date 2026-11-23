import "./load-env.js";

import { sql } from "drizzle-orm";

import { db, pool } from "./db.js";
import { todos } from "./schema.js";

try {
  // Keep the columns in sync with src/schema.ts.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS realtime_todos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      completed boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    insert into ${todos} (title)
    select 'Open this app in another tab'
    where not exists (select 1 from ${todos})
  `);
  console.log("Realtime todo table is ready.");
} finally {
  await pool.end();
}
