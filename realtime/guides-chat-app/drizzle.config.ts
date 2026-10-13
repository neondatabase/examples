import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

loadEnv({ path: ".env.local", quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Missing DATABASE_URL. Run `neon deploy` (or `neon env pull`) first.",
  );
}

export default defineConfig({
  out: "./drizzle",
  schema: "./backend/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
