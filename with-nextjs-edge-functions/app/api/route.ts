export const runtime = "edge";

import { neon } from "@neondatabase/serverless";

export async function GET() {
  if (!process.env.DATABASE_URL) return new Response(null, { status: 500 });
  const sql = neon(process.env.DATABASE_URL);
  const response = await sql`SELECT version()`;
  return new Response(response[0].version);
}
