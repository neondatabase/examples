// From guides/queries.md "Using a query builder or ORM" and subscribing.md "Show full database errors"
import { createRealtime } from "@neon/realtime/server";
import { drizzleAdapter } from "@neon/realtime-drizzle";

import { postgresDatabaseName } from "./env";

export const realtime = createRealtime({
  secret: process.env.NEON_REALTIME_SECRET!,
  // Not from the guides: the database name comes from DATABASE_URL, where the guides use "neondb"
  db: postgresDatabaseName,
  adapter: drizzleAdapter(),
  debugMode: process.env.NODE_ENV === "development",
});
