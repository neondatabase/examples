import { eq, sql } from "drizzle-orm";

import { db } from "./db.server";
import { todos } from "./schema";

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
