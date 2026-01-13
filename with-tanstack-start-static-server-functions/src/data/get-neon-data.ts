import { createServerFn } from "@tanstack/react-start";
import { staticFunctionMiddleware } from "@tanstack/start-static-server-functions";

// neon serverless driver
import { neon } from "@neondatabase/serverless";

export const getServerlessDriverData = createServerFn({ method: "GET" })
  .middleware([staticFunctionMiddleware])
  .handler(async () => {
    if (process.env.DATABASE_URL == null) {
      console.warn("[Error]: Missing database url");
      throw new Error("Missing database url");
    }

    const sql = neon(process.env.DATABASE_URL);
    const response = await sql`SELECT version()`;

    return response[0].version;
  });

// postgres.js
import postgres from "postgres";

export const getPostgresJsData = createServerFn({ method: "GET" })
  .middleware([staticFunctionMiddleware])
  .handler(async () => {
    if (process.env.DATABASE_URL == null) {
      console.warn("[Error]: Missing database url");
      throw new Error("Missing database url");
    }

    const sql = postgres(process.env.DATABASE_URL, {
      ssl: "require",
    });
    const response = await sql`SELECT version()`;
    return response[0].version;
  });

// node-postgres
import { Pool } from "node_modules/@types/pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
});

export const getNodePostgresData = createServerFn({ method: "GET" })
  .middleware([staticFunctionMiddleware])
  .handler(async () => {
    const client = await pool.connect();
    try {
      const { rows } = await client.query("SELECT version()");
      return rows[0].version;
    } finally {
      client.release();
    }
  });
