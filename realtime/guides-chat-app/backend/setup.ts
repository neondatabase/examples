// Not from the guides. `npm run db:setup` runs this after `drizzle-kit push` creates the tables
import "./load-env";

import { db, pool } from "./db";
import { channelMembers } from "./schema";

try {
  // backend/worker.ts reads channel 2 as support-bot, so make it a member
  await db
    .insert(channelMembers)
    .values({ channel_id: 2, user_id: "support-bot" })
    .onConflictDoNothing();

  console.log("Chat tables are ready.");
} finally {
  await pool.end();
}
