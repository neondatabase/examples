// Not from the guides. `npm run db:setup` runs this to create the tables
import "./load-env";

import { db, pool } from "./db";
import { channelMembers } from "./schema";

try {
  // Keep the columns in sync with backend/schema.ts
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id uuid PRIMARY KEY,
      channel_id integer NOT NULL,
      author_id text NOT NULL,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id integer NOT NULL,
      user_id text NOT NULL,
      CONSTRAINT channel_members_channel_id_user_id_pk PRIMARY KEY (channel_id, user_id)
    )
  `);

  // backend/worker.ts reads channel 2 as support-bot, so make it a member
  await db
    .insert(channelMembers)
    .values({ channel_id: 2, user_id: "support-bot" })
    .onConflictDoNothing();

  console.log("Chat tables are ready.");
} finally {
  await pool.end();
}
