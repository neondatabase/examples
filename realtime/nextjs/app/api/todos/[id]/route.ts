import { eq } from "drizzle-orm";

import type { UpdateTodoRequest } from "../../../../lib/api-types";
import { db } from "../../../../lib/db";
import { todos } from "../../../../lib/schema";

interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { status } = (await request.json()) as UpdateTodoRequest;
  if (status !== "active" && status !== "completed") {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }
  await db
    .update(todos)
    .set({ status })
    .where(eq(todos.id, Number(id)));
  return new Response(null, { status: 204 });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  await db.delete(todos).where(eq(todos.id, Number(id)));
  return new Response(null, { status: 204 });
}
