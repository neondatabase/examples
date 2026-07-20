"use server";

import { eq, not } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { todos } from "@/db/schema";

export async function addTodo(formData: FormData) {
  const text = formData.get("text")?.toString().trim();
  const dueDateValue = formData.get("dueDate");
  const categoryIdValue = formData.get("categoryId");

  const dueDate =
    typeof dueDateValue === "string" && dueDateValue !== ""
      ? dueDateValue
      : null;
  const categoryId =
    typeof categoryIdValue === "string" && categoryIdValue !== ""
      ? categoryIdValue
      : null;

  if (!text) return;

  await db.insert(todos).values({ text, dueDate, categoryId });
  revalidatePath("/");
}

export async function toggleTodo(id: string) {
  await db
    .update(todos)
    .set({ completed: not(todos.completed) })
    .where(eq(todos.id, id));
  revalidatePath("/");
}

export async function deleteTodo(id: string) {
  await db.delete(todos).where(eq(todos.id, id));
  revalidatePath("/");
}
