import { eq, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";

import { db } from "./db.server";
import { realtime } from "./realtime.server";
import { todos, type Todo } from "./schema";
import { allTodos } from "./todos.server";

export const sealTodos = createServerFn({ method: "GET" }).handler(() =>
  realtime.seal({ query: allTodos() }),
);

export const insertTodo = createServerFn({ method: "POST" })
  .validator((todo: Todo) => todo)
  .handler(({ data: todo }) =>
    db.transaction(async (tx) => {
      await tx.insert(todos).values(todo);
      return transactionId(tx);
    }),
  );

export const updateTodo = createServerFn({ method: "POST" })
  .validator((todo: Pick<Todo, "id" | "status">) => todo)
  .handler(({ data: todo }) =>
    db.transaction(async (tx) => {
      await tx
        .update(todos)
        .set({ status: todo.status })
        .where(eq(todos.id, todo.id));
      return transactionId(tx);
    }),
  );

export const deleteTodo = createServerFn({ method: "POST" })
  .validator((id: number) => id)
  .handler(({ data: id }) =>
    db.transaction(async (tx) => {
      await tx.delete(todos).where(eq(todos.id, id));
      return transactionId(tx);
    }),
  );

async function transactionId(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<{ readonly txid: string }> {
  const result = await tx.execute<{ txid: string }>(
    sql`SELECT pg_current_xact_id()::text AS txid`,
  );
  return { txid: result.rows[0]!.txid };
}
