import "./src/load-env.js";

import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL. Run `neon env pull` first.");
}

export default defineConfig({
  schema: "./src/schema.ts",
  dialect: "postgresql",
  tablesFilter: ["realtime_todos"],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
