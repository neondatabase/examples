import { db } from "./db";
import { todos } from "./schema";

export const allTodos = () =>
  db
    .select({ id: todos.id, title: todos.title, status: todos.status })
    .from(todos);
