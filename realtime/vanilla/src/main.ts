import "./style.css";

import {
  createRealtimeClient,
  type LiveQuerySnapshot,
} from "@neon/realtime/client";

import type {
  CreateTodoRequest,
  SealedTodosQuery,
  UpdateTodoRequest,
} from "./api-types.js";
import type { Todo } from "./schema.js";

const websocketUrl = import.meta.env.VITE_NEON_REALTIME_URL;
if (!websocketUrl) throw new Error("Missing VITE_NEON_REALTIME_URL");

const list = element<HTMLUListElement>("todos");
const form = element<HTMLFormElement>("new-todo");
const title = element<HTMLInputElement>("title");
const status = element<HTMLOutputElement>("status");
const error = element<HTMLParagraphElement>("error");

const client = createRealtimeClient({ url: websocketUrl });
let query = await sealTodos();
const subscription = client.subscribe(query);
let refreshTimer: ReturnType<typeof setTimeout>;

subscription.onChange(render);
scheduleQueryRefresh();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = title.value.trim();
  if (!value) return;
  title.value = "";
  await request("/api/todos", {
    method: "POST",
    body: JSON.stringify({ title: value } satisfies CreateTodoRequest),
  });
});

list.addEventListener("click", async (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>(
    "button[data-action]",
  );
  if (!button) return;
  const id = Number(button.dataset.id);
  if (button.dataset.action === "delete") {
    await request(`/api/todos/${id}`, { method: "DELETE" });
    return;
  }
  const nextStatus =
    button.dataset.status === "completed" ? "active" : "completed";
  await request(`/api/todos/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: nextStatus } satisfies UpdateTodoRequest),
  });
});

window.addEventListener("beforeunload", () => {
  clearTimeout(refreshTimer);
  subscription.unsubscribe();
  client.close();
});

function render(snapshot: LiveQuerySnapshot<Todo>): void {
  status.textContent = snapshot.status;
  status.className = `status ${snapshot.status}`;
  showError(snapshot.error?.message);
  list.replaceChildren(...(snapshot.data ?? []).map(todoElement));
}

function todoElement(todo: Todo): HTMLLIElement {
  const item = document.createElement("li");
  item.className = todo.status;

  const toggle = document.createElement("button");
  toggle.dataset.action = "toggle";
  toggle.dataset.id = String(todo.id);
  toggle.dataset.status = todo.status;
  toggle.className = "toggle";
  toggle.textContent = todo.status === "completed" ? "✓" : "○";
  toggle.setAttribute(
    "aria-label",
    `Mark ${todo.title} ${todo.status === "completed" ? "active" : "completed"}`,
  );

  const label = document.createElement("span");
  label.textContent = todo.title;

  const remove = document.createElement("button");
  remove.dataset.action = "delete";
  remove.dataset.id = String(todo.id);
  remove.className = "delete";
  remove.textContent = "Delete";

  item.append(toggle, label, remove);
  return item;
}

async function sealTodos(): Promise<SealedTodosQuery> {
  const response = await fetch("/api/todos/live");
  if (!response.ok) throw new Error("Could not authorize the todo query");
  return response.json() as Promise<SealedTodosQuery>;
}

function scheduleQueryRefresh(): void {
  clearTimeout(refreshTimer);
  const delay = Math.max(0, query.expiresAt - Date.now() - 10_000);
  refreshTimer = setTimeout(async () => {
    try {
      query = await sealTodos();
      await subscription.renew(query);
      scheduleQueryRefresh();
    } catch (cause) {
      showError(
        cause instanceof Error ? cause.message : "Authorization refresh failed",
      );
      refreshTimer = setTimeout(scheduleQueryRefresh, 1_000);
    }
  }, delay);
}

async function request(path: string, init: RequestInit): Promise<void> {
  showError();
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  if (!response.ok) showError(`Request failed (${response.status})`);
}

function showError(message?: string): void {
  error.hidden = !message;
  error.textContent = message ?? "";
}

function element<ElementType extends HTMLElement>(id: string): ElementType {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing #${id}`);
  return value as ElementType;
}
