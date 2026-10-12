import "./load-env";

import { sql } from "drizzle-orm";

import { db, pool } from "./db.server";
import { todos } from "./schema";

try {
  await db.execute(sql`alter table ${todos} replica identity full`);
  await db.execute(sql`
    insert into ${todos} (id, title)
    select 1, 'Open this app in another tab'
    where not exists (select 1 from ${todos})
  `);
  console.log("Realtime todo table is ready.");
} finally {
  await pool.end();
}
