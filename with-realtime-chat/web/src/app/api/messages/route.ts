import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/db/schema";

// Chat history is read from Postgres by the Next.js backend (same Drizzle +
// node-postgres setup as the function); live messages come over the WebSocket.
export async function GET() {
  const rows = await db
    .select()
    .from(messages)
    .orderBy(asc(messages.createdAt))
    .limit(200);
  return Response.json({ messages: rows });
}
