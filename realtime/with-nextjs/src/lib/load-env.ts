import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

// Neon connection strings use sslmode=require, which pg treats as verify-full
// but warns will mean weaker libpq semantics in pg 9. Ask for verify-full to
// keep today's behavior without the warning
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl?.includes("sslmode=require")) {
  process.env.DATABASE_URL = databaseUrl.replace(
    "sslmode=require",
    "sslmode=verify-full",
  );
}
