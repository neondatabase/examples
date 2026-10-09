import { hc } from "hono/client";

import type { AppType } from "../../src/server.js";

const api = hc<AppType>(window.location.origin);

export async function getLiveTodos() {
  const response = await api.api.todos.live.$get();
  if (!response.ok) throw new Error("Could not create the live query");
  return response.json();
}

export async function createTodo(title: string) {
  const response = await api.api.todos.$post({ json: { title } });
  if (!response.ok) throw new Error("Could not create the todo");
  return response.json();
}

export async function deleteTodo(id: number) {
  const response = await api.api.todos[":id"].$delete({
    param: { id: String(id) },
  });
  if (!response.ok) throw new Error("Could not delete the todo");
  return response.json();
}
