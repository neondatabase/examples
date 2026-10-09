import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import { requiredEnv } from "./env.js";

export const pool = new Pool({
  connectionString: requiredEnv("DATABASE_URL"),
  max: 5,
});

export const db = drizzle(pool);
