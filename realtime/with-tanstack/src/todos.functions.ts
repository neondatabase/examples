import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";

import { requireUser, type SessionUser } from "./auth.functions";
import { realtime } from "./realtime.server";
import { todos } from "./schema";
import { selectTodos, writeTodos } from "./todos.server";
import {
  newTodosInput,
  pageUserInput,
  todoIdsInput,
  todoUpdatesInput,
} from "./todos.schemas";

// Every function requires a signed-in user and only touches that user's rows.
// Anything that returns rows or a sealed query is POST, so it's never cached.
//
// Start applies its default CSRF middleware to server functions as long as
// there's no `src/start.ts`. If you add one, re-add
// `createCsrfMiddleware({ filter: (c) => c.handlerType === "serverFn" })`.

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

// The browser sends the user id its page was loaded for. If another tab has
// since signed in as someone else, the page has to reload: its writes would go
// to the new user, and Realtime rejects a refreshed query for a different user.
function requireSameUser(userId: string, user: SessionUser) {
  if (userId !== user.id) throw new Error("SESSION_CHANGED");
}

// Re-seals the live query before it expires.
export const refreshTodosQuery = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(pageUserInput)
  .handler(({ data, context }) => {
    requireSameUser(data.userId, context.user);
    return realtime.seal({ query: selectTodos(context.user.id) });
  });

// Each write takes a whole batch of changes from one TanStack DB transaction
// and returns its Postgres transaction id, or `null` if no row changed (for
// example, an id that's already gone).
export const createTodos = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(newTodosInput)
  .handler(({ data: { userId, batch }, context }) => {
    requireSameUser(userId, context.user);
    return writeTodos(async (tx) => {
      const inserted = await tx
        .insert(todos)
        .values(batch.map((todo) => ({ ...todo, userId: context.user.id })))
        .returning({ id: todos.id });
      return inserted.length;
    });
  });

export const updateTodos = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(todoUpdatesInput)
  .handler(({ data: { userId, batch }, context }) => {
    requireSameUser(userId, context.user);
    return writeTodos(async (tx) => {
      let count = 0;
      for (const { id, changes } of batch) {
        // Drizzle rejects an empty `set`.
        if (Object.values(changes).every((v) => v === undefined)) continue;
        const updated = await tx
          .update(todos)
          .set(changes)
          .where(and(eq(todos.id, id), eq(todos.userId, context.user.id)))
          .returning({ id: todos.id });
        count += updated.length;
      }
      return count;
    });
  });

export const deleteTodos = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(todoIdsInput)
  .handler(({ data: { userId, batch }, context }) => {
    requireSameUser(userId, context.user);
    return writeTodos(async (tx) => {
      const deleted = await tx
        .delete(todos)
        .where(and(inArray(todos.id, batch), eq(todos.userId, context.user.id)))
        .returning({ id: todos.id });
      return deleted.length;
    });
  });
