import "./load-env";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { todos } from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL. Run `neon env pull` first.");
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);

async function setup() {
  try {
    await db.execute(sql`
      insert into ${todos} (title)
      select 'Open this app in another tab'
      where not exists (select 1 from ${todos})
    `);
    console.log("Realtime todo table is ready.");
  } finally {
    await pool.end();
  }
}

setup().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
