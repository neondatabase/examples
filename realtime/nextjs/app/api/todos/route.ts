import type { CreateTodoRequest } from "../../../lib/api-types";
import { db } from "../../../lib/db";
import { todos } from "../../../lib/schema";

export async function POST(request: Request) {
  const { title } = (await request.json()) as CreateTodoRequest;
  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  if (!normalizedTitle) {
    return Response.json({ error: "Title is required" }, { status: 400 });
  }
  const [todo] = await db
    .insert(todos)
    .values({ title: normalizedTitle, status: "active" })
    .returning();
  return Response.json(todo, { status: 201 });
}
