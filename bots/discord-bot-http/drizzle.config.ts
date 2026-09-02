import "./load-env";
import { defineConfig } from "drizzle-kit";
import { parseEnv } from "@neon/env";
import neonConfig from "./neon";

const { postgres } = parseEnv(neonConfig, ["DATABASE_URL"]);

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: postgres.databaseUrl,
  },
});
