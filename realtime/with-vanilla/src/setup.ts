import "./load-env.js";

import { pool } from "./db.js";

try {
  await pool.query(`
    create table if not exists realtime_todos (
      id serial primary key,
      title text not null,
      completed boolean not null default false
    )
  `);
  await pool.query(`
    insert into realtime_todos (title)
    select 'Open this app in another tab'
    where not exists (select 1 from realtime_todos)
  `);
  console.log("Realtime todo table is ready.");
} finally {
  await pool.end();
}
