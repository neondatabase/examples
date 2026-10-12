import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";

import type { Todo } from "./schema";

export const refreshTodosQuery = createServerFn({ method: "GET" }).handler(
  async () => {
    const { realtime } = await import("./realtime.server");
    const { selectTodos } = await import("./todos.server");
    return realtime.seal({ query: selectTodos() });
  },
);

export const insertTodo = createServerFn({ method: "POST" })
  .validator((todo: Todo) => todo)
  .handler(async ({ data: todo }) => {
    const { db } = await import("./db.server");
    const { todos } = await import("./schema");
    const [inserted] = await db
      .insert(todos)
      .values(todo)
      .returning({ txid: sql<string>`pg_current_xact_id()::text` });
    if (!inserted) throw new Error("Postgres did not return the new todo");
    return inserted;
  });

export const updateTodo = createServerFn({ method: "POST" })
  .validator((todo: Pick<Todo, "id" | "completed">) => todo)
  .handler(async ({ data: todo }) => {
    const { db } = await import("./db.server");
    const { todos } = await import("./schema");
    const [updated] = await db
      .update(todos)
      .set({ completed: todo.completed })
      .where(eq(todos.id, todo.id))
      .returning({ txid: sql<string>`pg_current_xact_id()::text` });
    if (!updated) throw new Error("Todo not found");
    return updated;
  });

export const deleteTodo = createServerFn({ method: "POST" })
  .validator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { db } = await import("./db.server");
    const { todos } = await import("./schema");
    const [deleted] = await db
      .delete(todos)
      .where(eq(todos.id, id))
      .returning({ txid: sql<string>`pg_current_xact_id()::text` });
    if (!deleted) throw new Error("Todo not found");
    return deleted;
  });
