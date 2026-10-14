"use server";

import { sql } from "kysely";
import { z } from "zod";

import { getUser } from "@/auth/server";
import { getDb } from "@/lib/db";

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
const txid = sql<string>`pg_current_xact_id()::text`.as("txid");
const toResult = (row?: { txid: string }): WriteResult =>
  row ? { kind: "committed", txid: row.txid } : { kind: "unchanged" };

export async function addTodo(
  raw: z.input<typeof addInput>,
): Promise<WriteResult> {
  const user = await getUser(); // every action checks the session itself: proxy.ts skips actions
  if (!user) return { kind: "rejected", reason: "UNAUTHENTICATED" };
  const input = addInput.safeParse(raw);
  if (!input.success) return { kind: "rejected", reason: "INVALID_INPUT" };
  const row = await getDb()
    .insertInto("realtime_next_todos")
    .values({ id: input.data.id, user_id: user.id, title: input.data.title }) // user_id from the session only
    .onConflict((oc) => oc.column("id").doNothing()) // replayed id: no write, nothing to wait for
    .returning(txid)
    .executeTakeFirst();
  return toResult(row);
}

export async function setTodoCompleted(
  raw: z.input<typeof setCompletedInput>,
): Promise<WriteResult> {
  const user = await getUser();
  if (!user) return { kind: "rejected", reason: "UNAUTHENTICATED" };
  const input = setCompletedInput.safeParse(raw);
  if (!input.success) return { kind: "rejected", reason: "INVALID_INPUT" };
  const row = await getDb()
    .updateTable("realtime_next_todos")
    .set({ completed: input.data.completed })
    .where("id", "=", input.data.id)
    .where("user_id", "=", user.id) // only the user's own row
    .returning(txid)
    .executeTakeFirst();
  return toResult(row);
}

export async function deleteTodo(
  raw: z.input<typeof deleteInput>,
): Promise<WriteResult> {
  const user = await getUser();
  if (!user) return { kind: "rejected", reason: "UNAUTHENTICATED" };
  const input = deleteInput.safeParse(raw);
  if (!input.success) return { kind: "rejected", reason: "INVALID_INPUT" };
  const row = await getDb()
    .deleteFrom("realtime_next_todos")
    .where("id", "=", input.data.id)
    .where("user_id", "=", user.id) // only the user's own row
    .returning(txid)
    .executeTakeFirst();
  return toResult(row);
}

// No revalidatePath, refresh() or updateTag after a write: the live query delivers the change.
