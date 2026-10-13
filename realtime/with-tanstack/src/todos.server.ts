import { eq, sql } from "drizzle-orm";

import { db } from "./db.server";
import { todos } from "./schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// One query for both the SSR rows and the sealed live query, so they match.
// Realtime matches each result column to its key by name, so `createdAt` gets
// an SQL alias (the column is `created_at`). `mapWith` keeps it a `Date`.
// No `orderBy`: the collection stores rows by key and doesn't keep their order,
// so the page sorts them in `useLiveQuery`.
export const selectTodos = (userId: string) =>
  db
    .select({
      id: todos.id,
      title: todos.title,
      completed: todos.completed,
      createdAt: sql<Date>`${todos.createdAt}`
        .mapWith(todos.createdAt)
        .as("createdAt"),
    })
    .from(todos)
    .where(eq(todos.userId, userId));

// The row shape the browser sees, inferred from the query.
export type Todo = Awaited<ReturnType<typeof selectTodos>>[number];

// Runs `write` in a transaction and returns its transaction id, which the
// browser waits to see come back over Realtime. A write that changes no rows
// returns `{ txid: null }`: there's nothing to wait for and nothing to roll back.
export const writeTodos = (write: (tx: Tx) => Promise<number>) =>
  db.transaction(async (tx): Promise<{ txid: string | null }> => {
    if ((await write(tx)) === 0) return { txid: null };
    const { rows } = await tx.execute<{ txid: string }>(
      sql`select pg_current_xact_id()::text as txid`,
    );
    return { txid: rows[0]!.txid };
  });
