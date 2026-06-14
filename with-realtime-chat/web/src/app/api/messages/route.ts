import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/db/schema";
import { auth } from "@/lib/auth/server";

// Chat history is read from Postgres by the Next.js backend (same Drizzle +
// node-postgres setup as the function); live messages come over the WebSocket.
// Gated on a valid Neon Auth session — only signed-in users can read the chat.
export async function GET() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(messages)
    .orderBy(asc(messages.createdAt))
    .limit(200);
  return Response.json({ messages: rows });
}
