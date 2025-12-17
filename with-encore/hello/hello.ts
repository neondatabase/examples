import { api } from "encore.dev/api";
import { db } from "./db";

interface Message {
  id: number;
  text: string;
  created_at: Date;
}

interface CreateRequest {
  text: string;
}

// Create a new message
export const create = api(
  { expose: true, method: "POST", path: "/messages" },
  async (req: CreateRequest): Promise<Message> => {
    const row = await db.queryRow<Message>`
      INSERT INTO messages (text)
      VALUES (${req.text})
      RETURNING id, text, created_at
    `;
    if (!row) throw new Error("Failed to create message");
    return row;
  }
);

// List all messages
export const list = api(
  { expose: true, method: "GET", path: "/messages" },
  async (): Promise<{ messages: Message[] }> => {
    const rows = await db.query<Message>`
      SELECT id, text, created_at
      FROM messages
      ORDER BY created_at DESC
    `;
    
    const messages: Message[] = [];
    for await (const row of rows) {
      messages.push(row);
    }
    
    return { messages };
  }
);

