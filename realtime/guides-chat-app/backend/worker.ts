// From guides/subscribing.md "Subscribe in trusted backend code". Run it with `npm run worker`
// Not from the guides: load .env.local first, because ./env and ./queries read process.env when imported
import "./load-env";

import { createRealtime } from "@neon/realtime/server";
import { drizzleAdapter } from "@neon/realtime-drizzle";

import { postgresDatabaseName } from "./env";
import { messagesQuery } from "./queries";

// The worker acts for one known user, so its parameters are trusted constants
const SUPPORT_BOT_ID = "support-bot";
const SUPPORT_CHANNEL_ID = 2;

const realtime = createRealtime({
  url: process.env.NEON_REALTIME_URL!,
  secret: process.env.NEON_REALTIME_SECRET!,
  // Not from the guides: the database name comes from DATABASE_URL, where the guides use "neondb"
  db: postgresDatabaseName,
  adapter: drizzleAdapter(),
});

const query = messagesQuery(SUPPORT_BOT_ID, SUPPORT_CHANNEL_ID);

const subscription = await realtime.subscribe(query);
subscription.onChange(console.log);

process.once("SIGTERM", () => realtime.close());
