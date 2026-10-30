import { attachDatabasePool } from "@neon/functions";
import pg from "pg";
import { handle } from "./app.ts";

let pool: pg.Pool | undefined;

export default {
  async fetch(request: Request): Promise<Response> {
    if (!pool) {
      pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 4,
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
        application_name: "neon-scheduled-rollup",
      });
      attachDatabasePool(pool);
    }
    return handle(request, { pool, apiKey: process.env.ROLLUP_API_KEY ?? "" });
  },
};
