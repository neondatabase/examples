import "server-only";

import { asc, eq } from "drizzle-orm";

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
    .orderBy(asc(todos.created_at), asc(todos.id));
}

export type TodoRow = Awaited<ReturnType<typeof todosQuery>>[number];

// Read and seal the same query. The stream's first full result replaces these rows, so nothing is missed
// or doubled. It doesn't resume from them either: the rows are sent again (a package gap).
export async function loadTodos(userId: string) {
  const query = todosQuery(userId);
  const [rows, sealedQuery] = await Promise.all([
    query,
    getRealtime().seal({ query }),
  ]);
  return { rows, sealedQuery };
}

export const sealTodos = (userId: string) =>
  getRealtime().seal({ query: todosQuery(userId) });
