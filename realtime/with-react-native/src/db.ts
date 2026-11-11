import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "./env.js";

export const pool = new Pool({
  connectionString: env.postgres.databaseUrl,
  max: 5,
  min: 1,
});

pool.on("error", (error) => {
  console.error("Unexpected error on idle PostgreSQL client", error);
});

export const db = drizzle(pool);
