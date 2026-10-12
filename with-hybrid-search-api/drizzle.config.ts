import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";
import { postgresUrl } from "./src/connection.js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error("DATABASE_URL_UNPOOLED is required for migrations");

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: postgresUrl(url) },
});
