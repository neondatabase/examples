import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const createDb = (databaseUrl: string) => {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });

  return drizzle(pool);
};

let db: ReturnType<typeof createDb> | undefined;

export const getDb = () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to use profile commands.");
  }

  db ??= createDb(databaseUrl);

  return db;
};
