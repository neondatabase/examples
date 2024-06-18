import type { APIRoute } from "astro";
import { neon } from "@neondatabase/serverless";

export const POST: APIRoute = async ({}) => {
  const sql = neon(import.meta.env.DATABASE_URL);
  const response = await sql`SELECT version()`;
  return new Response(response[0].version);
};
