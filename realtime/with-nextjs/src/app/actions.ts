"use server";

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { realtime } from "@/realtime";
import { todos } from "@/schema";
import { selectTodos } from "@/todos";

export async function refreshTodosQuery() {
  return realtime.seal({ query: selectTodos() });
}

export async function createTodo(titleInput: string) {
  const title = titleInput.trim();
  if (!title || title.length > 200) throw new Error("Invalid todo title");

  const [todo] = await db
    .insert(todos)
    .values({ title })
    .returning({
      id: todos.id,
      txid: sql<string>`pg_current_xact_id()::text`,
    });
  if (!todo) throw new Error("Postgres did not return the new todo");
  return todo;
}

export async function setTodoCompleted(id: number, completed: boolean) {
  const [updated] = await db
    .update(todos)
    .set({ completed })
    .where(eq(todos.id, id))
    .returning({ txid: sql<string>`pg_current_xact_id()::text` });
  if (!updated) throw new Error("Todo not found");
  return updated;
}

export async function deleteTodo(id: number) {
  const [deleted] = await db
    .delete(todos)
    .where(eq(todos.id, id))
    .returning({ txid: sql<string>`pg_current_xact_id()::text` });
  if (!deleted) throw new Error("Todo not found");
  return deleted;
}
