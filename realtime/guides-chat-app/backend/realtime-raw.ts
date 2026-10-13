// From guides/queries.md "Using raw SQL". An alternative to realtime.ts, not imported by the app
import { createRealtime } from "@neon/realtime/server";

import { postgresDatabaseName } from "./env";

export const realtime = createRealtime({
  secret: process.env.NEON_REALTIME_SECRET!,
  db: postgresDatabaseName,
});
