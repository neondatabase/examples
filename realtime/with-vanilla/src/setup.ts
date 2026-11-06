import "./load-env.js";

import { pool } from "./db.js";

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS realtime_todos (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await pool.query(`
    INSERT INTO realtime_todos (title)
    SELECT 'Open this app in another tab'
    WHERE NOT EXISTS (SELECT 1 FROM realtime_todos)
  `);
  console.log("Realtime todo table is ready.");
} finally {
  await pool.end();
}
