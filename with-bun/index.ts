import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(`Please add a DATABASE_URL environment variable.`);
}

// Bun automatically loads the DATABASE_URL from .env.local
// Refer to: https://bun.sh/docs/runtime/env for more information
const sql = neon(connectionString);

const rows = await sql`SELECT version()`;

console.log(rows[0].version);
