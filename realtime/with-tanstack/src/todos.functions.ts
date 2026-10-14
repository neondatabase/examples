import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, sql } from "drizzle-orm";

import { requireUser } from "./auth/auth.functions";
import { db } from "./db.server";
import { realtime } from "./realtime.server";
import { todos } from "./schema";
import { selectTodos } from "./todos.server";
import { newTodosInput, todoIdsInput, todoUpdatesInput } from "./todos.schemas";

// Every function requires a signed-in user and only touches that user's rows.
// Anything that returns rows or a sealed query is POST, so it's never cached.
//
// Start applies its default CSRF middleware to server functions as long as
// there's no `src/start.ts`. If you add one, re-add
// `createCsrfMiddleware({ filter: (c) => c.handlerType === "serverFn" })`.

type WriteResult = { readonly txid: string | null };

const txid = sql<string>`pg_current_xact_id()::text`;

const writeResult = (row?: { txid: string }): WriteResult => ({
  txid: row?.txid ?? null,
});

// The page's rows, plus a sealed live query for exactly the same rows.
export const loadTodos = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const [rows, query] = await Promise.all([
      selectTodos(context.user.id),
      realtime.seal({ query: selectTodos(context.user.id) }),
    ]);
    return { rows, query };
  });

// Re-seals the live query before it expires.
export const refreshTodosQuery = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(({ context }) =>
    realtime.seal({ query: selectTodos(context.user.id) }),
  );

// Each write sends a whole TanStack DB batch in one SQL statement and returns
// its Postgres transaction id, or `null` if no row changed (for example, an id
// that's already gone).
export const createTodos = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(newTodosInput)
  .handler(async ({ data: { batch }, context }) => {
    const [created] = await db
      .insert(todos)
      .values(batch.map((todo) => ({ ...todo, userId: context.user.id })))
      .returning({ txid });
    return writeResult(created);
  });

export const updateTodos = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(todoUpdatesInput)
  .handler(async ({ data: { batch }, context }) => {
    const changed = batch.filter(({ changes }) =>
      Object.values(changes).some((value) => value !== undefined),
    );
    if (changed.length === 0) return writeResult();

    const titleCases = changed.flatMap(({ id, changes }) =>
      changes.title === undefined
        ? []
        : [sql`WHEN ${todos.id} = ${id} THEN ${changes.title}`],
    );
    const completedCases = changed.flatMap(({ id, changes }) =>
      changes.completed === undefined
        ? []
        : [sql`WHEN ${todos.id} = ${id} THEN ${changes.completed}`],
    );

    const [updated] = await db
      .update(todos)
      .set({
        ...(titleCases.length > 0
          ? {
              title: sql<string>`CASE ${sql.join(titleCases, sql.raw(" "))} ELSE ${todos.title} END`,
            }
          : {}),
        ...(completedCases.length > 0
          ? {
              completed: sql<boolean>`CASE ${sql.join(completedCases, sql.raw(" "))} ELSE ${todos.completed} END`,
            }
          : {}),
      })
      .where(
        and(
          inArray(
            todos.id,
            changed.map(({ id }) => id),
          ),
          eq(todos.userId, context.user.id),
        ),
      )
      .returning({ txid });
    return writeResult(updated);
  });

export const deleteTodos = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(todoIdsInput)
  .handler(async ({ data: { batch }, context }) => {
    const [deleted] = await db
      .delete(todos)
      .where(and(inArray(todos.id, batch), eq(todos.userId, context.user.id)))
      .returning({ txid });
    return writeResult(deleted);
  });
