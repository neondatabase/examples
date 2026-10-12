import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import { env } from "./env.js";

export const pool = new Pool({
  connectionString: env.postgres.databaseUrl,
  max: 5,
  min: 1,
});

export const db = drizzle(pool);
