import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit auto-loads only .env
loadEnv({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Missing DATABASE_URL. Run `neon deploy` (first time) or `neon env pull`.",
  );
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/lib/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // manage only this app's table; Neon Auth lives in the neon_auth schema
  tablesFilter: ["realtime_next_todos"],
});
