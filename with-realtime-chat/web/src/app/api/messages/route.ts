import { neon } from "@neondatabase/serverless";

// Chat history is read from Postgres by the Next.js backend; live messages come
// over the WebSocket to the Neon Function.
const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  const rows = await sql`
    SELECT id, user_id, user_name, body, created_at
    FROM messages
    ORDER BY created_at ASC
    LIMIT 200
  `;
  return Response.json({ messages: rows });
}
