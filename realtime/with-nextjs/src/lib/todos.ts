import "server-only";

import type { InferResult } from "kysely";

import { getDb } from "./db";
import { getRealtime } from "./realtime";

// The only place the live query is built. The server read, the seal and every renewal use it, so their
// fingerprints match. `userId` must come from getUser(), never from the client.
function todosQuery(userId: string) {
  return getDb()
    .selectFrom("realtime_next_todos")
    .select(["id", "title", "completed", "created_at"])
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .orderBy("id", "desc");
}

export type TodoRow = InferResult<ReturnType<typeof todosQuery>>[number];

// Read and seal the same query. The stream's first full result replaces these rows, so nothing is missed
// or doubled. It sends every row again rather than resuming from these.
export async function loadTodos(userId: string) {
  const query = todosQuery(userId);
  const [rows, sealedQuery] = await Promise.all([
    query.execute(),
    getRealtime().seal({ query }), // compiles the builder to SQL; never runs it
  ]);
  return { rows, sealedQuery };
}

export const sealTodos = (userId: string) =>
  getRealtime().seal({ query: todosQuery(userId) });
