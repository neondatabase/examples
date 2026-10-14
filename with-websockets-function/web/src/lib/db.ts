import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";

// node-postgres + Drizzle, same as the function. On Vercel Fluid Compute the
// instance is reused across invocations, so the pool lives at module scope and
// is shared. `attachDatabasePool` lets the runtime drain idle connections before
// the instance suspends (so they don't leak); idle timeouts don't fire reliably
// during suspension, so disable them.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 0,
});
attachDatabasePool(pool);

export const db = drizzle(pool);
