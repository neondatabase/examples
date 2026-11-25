import { hc } from "hono/client";
import { Platform } from "react-native";

import type { AppType } from "../src/server";

const simulatorApiUrl = Platform.select({
  android: "http://10.0.2.2:3001",
  default: "http://127.0.0.1:3001",
});

const apiUrl = (process.env.EXPO_PUBLIC_API_URL || simulatorApiUrl).replace(
  /\/$/,
  "",
);
const api = hc<AppType>(apiUrl);

export async function getLiveTodos() {
  const response = await api.api.todos.live.$post();
  if (!response.ok) throw new Error("Could not create the live query");
  return response.json();
}

export async function createTodo(id: string, title: string) {
  const response = await api.api.todos.$post({ json: { id, title } });
  if (!response.ok) throw new Error("Could not create the todo");
  return response.json();
}

export async function toggleTodo(id: string, completed: boolean) {
  const response = await api.api.todos[":id"].$patch({
    param: { id },
    json: { completed },
  });
  if (!response.ok) throw new Error("Could not update the todo");
  return response.json();
}

export async function deleteTodo(id: string) {
  const response = await api.api.todos[":id"].$delete({ param: { id } });
  if (!response.ok) throw new Error("Could not delete the todo");
  return response.json();
}
