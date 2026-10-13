// From guides/queries.md "Setup"
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "./schema";

// Node.js versions older than v22 need a WebSocket constructor
neonConfig.webSocketConstructor = ws;

// Exported for the server's startup check and shutdown, and for setup.ts
export const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const db = drizzle(pool, { schema });

// So an idle connection error doesn't crash the server
pool.on("error", (error: Error) => {
  console.error("Unexpected error on idle PostgreSQL client", error);
});
