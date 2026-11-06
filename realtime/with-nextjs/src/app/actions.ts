"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getUser } from "@/auth/server";
import { getDb } from "@/lib/db";
import { todos } from "@/lib/schema";

// Typed results rather than throws: in production Next.js hides a thrown error's message.
export type WriteResult =
  | { kind: "committed"; txid: string }
  | { kind: "unchanged" } // nothing matched: deleted elsewhere, someone else's id, or a replayed add
  | { kind: "rejected"; reason: "UNAUTHENTICATED" | "INVALID_INPUT" };

const addInput = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
});
const setCompletedInput = z.object({ id: z.uuid(), completed: z.boolean() });
const deleteInput = z.object({ id: z.uuid() });

// Same statement, same transaction; works on any driver.
const txid = sql<string>`pg_current_xact_id()::text`;
const toResult = (row?: { txid: string }): WriteResult =>
  row ? { kind: "committed", txid: row.txid } : { kind: "unchanged" };

export async function addTodo(
  pageUserId: string,
  raw: z.input<typeof addInput>,
): Promise<WriteResult> {
  const user = await getUser(pageUserId); // every action checks the session itself: proxy.ts skips actions
  if (!user) return { kind: "rejected", reason: "UNAUTHENTICATED" };
  const input = addInput.safeParse(raw);
  if (!input.success) return { kind: "rejected", reason: "INVALID_INPUT" };
  const [row] = await getDb()
    .insert(todos)
    .values({ id: input.data.id, user_id: user.id, title: input.data.title }) // user_id from the session only
    .onConflictDoNothing({ target: todos.id }) // replayed id: no write, nothing to wait for
    .returning({ txid });
  return toResult(row);
}

export async function setTodoCompleted(
  pageUserId: string,
  raw: z.input<typeof setCompletedInput>,
): Promise<WriteResult> {
  const user = await getUser(pageUserId);
  if (!user) return { kind: "rejected", reason: "UNAUTHENTICATED" };
  const input = setCompletedInput.safeParse(raw);
  if (!input.success) return { kind: "rejected", reason: "INVALID_INPUT" };
  const [row] = await getDb()
    .update(todos)
    .set({ completed: input.data.completed })
    .where(and(eq(todos.id, input.data.id), eq(todos.user_id, user.id))) // only the user's own row
    .returning({ txid });
  return toResult(row);
}

export async function deleteTodo(
  pageUserId: string,
  raw: z.input<typeof deleteInput>,
): Promise<WriteResult> {
  const user = await getUser(pageUserId);
  if (!user) return { kind: "rejected", reason: "UNAUTHENTICATED" };
  const input = deleteInput.safeParse(raw);
  if (!input.success) return { kind: "rejected", reason: "INVALID_INPUT" };
  const [row] = await getDb()
    .delete(todos)
    .where(and(eq(todos.id, input.data.id), eq(todos.user_id, user.id))) // only the user's own row
    .returning({ txid });
  return toResult(row);
}

// No revalidatePath, refresh() or updateTag after a write: the live query delivers the change.
