import { asc } from "drizzle-orm";

import { getDb } from "./db";
import { todos } from "./schema";

export const selectTodos = () =>
  getDb()
    .select({ id: todos.id, title: todos.title, completed: todos.completed })
    .from(todos)
    .orderBy(asc(todos.id));
