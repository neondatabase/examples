import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl?.includes("sslmode=require")) {
  process.env.DATABASE_URL = databaseUrl.replace(
    "sslmode=require",
    "sslmode=verify-full",
  );
}
