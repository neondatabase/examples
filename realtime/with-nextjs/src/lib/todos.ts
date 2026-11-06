import "server-only";

import { desc, eq } from "drizzle-orm";

import { getDb } from "./db";
import { getRealtime } from "./realtime";
import { todos } from "./schema";

// The only place the live query is built. The server read, the seal and every renewal use it, so their
// fingerprints match. `userId` must come from getUser(), never from the client.
function todosQuery(userId: string) {
  return getDb()
    .select({
      id: todos.id,
      title: todos.title,
      completed: todos.completed,
      created_at: todos.created_at,
    })
    .from(todos)
    .where(eq(todos.user_id, userId))
    .orderBy(desc(todos.created_at), desc(todos.id));
}

export type TodoRow = Awaited<ReturnType<typeof todosQuery>>[number];

// Read and seal the same query. The stream's first full result replaces these rows, so nothing is missed
// or doubled. It sends every row again rather than resuming from these.
export async function loadTodos(userId: string) {
  const query = todosQuery(userId);
  const [rows, sealedQuery] = await Promise.all([
    query, // awaiting the builder runs it
    getRealtime().seal({ query }), // compiles the builder to SQL; never runs it
  ]);
  return { rows, sealedQuery };
}

export const sealTodos = (userId: string) =>
  getRealtime().seal({ query: todosQuery(userId) });
