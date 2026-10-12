import { asc } from "drizzle-orm";

import { db } from "./db.server";
import { todos } from "./schema";

export const selectTodos = () =>
  db
    .select({ id: todos.id, title: todos.title, completed: todos.completed })
    .from(todos)
    .orderBy(asc(todos.id));
