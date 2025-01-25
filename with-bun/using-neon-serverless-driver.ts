import { neon } from '@neondatabase/serverless';

const connectionString = process.env.POSTGRES_URL as string;

if (!connectionString) {
  throw new Error(`Please add a POSTGRES_URL environment variable.`);
}

// Bun automatically loads the POSTGRES_URL from .env.local
// Refer to: https://bun.sh/docs/runtime/env for more information
const sql = neon(connectionString);

const rows = await sql`SELECT version()`;

console.log(rows[0]);
