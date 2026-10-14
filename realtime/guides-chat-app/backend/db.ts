// From guides/queries.md "Setup"
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Exported, unlike in the guides, for the server's startup check and shutdown, and for setup.ts
export const pool = new Pool({
  // Neon URLs say sslmode=require. Asking pg for verify-full keeps today's checks and skips its warning
  connectionString: process.env.DATABASE_URL!.replace(
    "sslmode=require",
    "sslmode=verify-full",
  ),
});
export const db = drizzle(pool, { schema });

// So an idle connection error, for example when the compute scales to zero, doesn't crash the API
pool.on("error", (error: Error) => console.error(error));
