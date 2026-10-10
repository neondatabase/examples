import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Push only the domain schema. The filter keeps drizzle-kit away from the
// tables Mastra creates in the same database.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url: process.env.DATABASE_URL! },
  tablesFilter: ["workspaces", "users", "companies", "people", "leads", "lead_inputs", "findings"],
});
