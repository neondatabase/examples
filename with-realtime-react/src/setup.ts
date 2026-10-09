import "./load-env.js";

import { sql } from "drizzle-orm";

import { db, pool } from "./db.js";
import { todos } from "./schema.js";

try {
  await db.execute(sql`alter table ${todos} replica identity full`);
  await db.execute(sql`
    insert into ${todos} (title)
    select 'Open this app in another tab'
    where not exists (select 1 from ${todos})
  `);
  console.log("Realtime todo table is ready.");
} finally {
  await pool.end();
}
