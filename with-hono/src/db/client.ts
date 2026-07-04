import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDatabaseUrl } from "../env.js";

const createDb = (databaseUrl: string) => {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });

  return drizzle(pool);
};

let db: ReturnType<typeof createDb> | undefined;

export const getDb = () => {
  db ??= createDb(getDatabaseUrl());

  return db;
};

