import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

loadEnv({ path: ".env.local", quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL. Run `neon env pull` first.");
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/schema.ts",
  dialect: "postgresql",
  // Only manage this example's table, so `drizzle-kit push` against a shared
  // database never proposes dropping other tables.
  tablesFilter: ["realtime_todos"],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
