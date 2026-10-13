// `npm run db:setup` runs this after `drizzle-kit push` creates the tables
import "./load-env";

import { sql } from "drizzle-orm";

import { db, pool } from "./db";
import { channelMembers, messages } from "./schema";

try {
  // Saves the engine a lookup on updates and deletes (guides/queries.md "Table requirements")
  await db.execute(sql`ALTER TABLE ${messages} REPLICA IDENTITY FULL`);
  await db.execute(sql`ALTER TABLE ${channelMembers} REPLICA IDENTITY FULL`);

  // backend/worker.ts reads channel 2 as support-bot, so make it a member
  await db
    .insert(channelMembers)
    .values({ channel_id: 2, user_id: "support-bot" })
    .onConflictDoNothing();

  console.log("Chat tables are ready.");
} finally {
  await pool.end();
}
