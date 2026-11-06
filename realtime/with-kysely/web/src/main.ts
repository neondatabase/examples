import "./style.css";

import {
  createRealtimeClient,
  type LiveQuerySnapshot,
  type MaterializedLiveQuerySubscription,
  type RealtimeClient,
} from "@neon/realtime/client";

import type {
  CreateTodoResponse,
  LiveTodosResponse,
  MutationResponse,
} from "../../src/api-types.js";
import type { Todo } from "../../src/schema.js";

type OptimisticAction =
  | { readonly type: "add"; readonly todo: Todo }
  | {
      readonly type: "set-completed";
      readonly id: Todo["id"];
      readonly completed: boolean;
    }
  | { readonly type: "delete"; readonly id: Todo["id"] };

const list = element<HTMLUListElement>("todos");
const form = element<HTMLFormElement>("new-todo");
const titleInput = element<HTMLInputElement>("title");
const status = element<HTMLOutputElement>("status");
const error = element<HTMLParagraphElement>("error");

let authoritativeTodos: readonly Todo[] = [];
const optimisticActions = new Map<number, OptimisticAction>();
const persistedIds = new Map<Todo["id"], Todo["id"]>();
const pendingCreates = new Map<Todo["id"], Promise<CreateTodoResponse>>();
let nextActionId = 1;
let nextOptimisticTodoId = -1;
let streamError: string | undefined;
let mutationError: string | undefined;

let client: RealtimeClient | undefined;
let subscription: MaterializedLiveQuerySubscription<Todo> | undefined;
let stopRenewal: (() => void) | undefined;
try {
  ({ client, subscription, stopRenewal } = await subscribeToTodos());
} catch {
  status.textContent = "error";
  setStatusColor("error");
  streamError = "Could not load todos. Reload to retry.";
  showError();
  form.remove();
}

if (subscription) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return;

    titleInput.value = "";
    const temporaryId = nextOptimisticTodoId--;
    const request = createTodo(title);
    pendingCreates.set(temporaryId, request);
    void request.then(
      () => pendingCreates.delete(temporaryId),
      () => pendingCreates.delete(temporaryId),
    );

    mutate(
      {
        type: "add",
        todo: { id: temporaryId, title, completed: false },
      },
      async () => {
        const result = await request;
        persistedIds.set(temporaryId, result.id);
        renderTodos();
        return result;
      },
      () => {
        if (!titleInput.value) titleInput.value = title;
      },
    );
  });

  list.addEventListener("change", (event) => {
    const checkbox = (event.target as Element).closest<HTMLInputElement>(
      'input[data-action="toggle"]',
    );
    if (!checkbox) return;
    const id = Number(checkbox.dataset.id);
    mutate(
      { type: "set-completed", id, completed: checkbox.checked },
      async () => toggleTodo(await persistedId(id)),
    );
  });

  list.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      'button[data-action="delete"]',
    );
    if (!button) return;
    const id = Number(button.dataset.id);
    mutate({ type: "delete", id }, async () =>
      deleteTodo(await persistedId(id)),
    );
  });
}

window.addEventListener("beforeunload", () => {
  stopRenewal?.();
  subscription?.unsubscribe();
  client?.close();
});

async function subscribeToTodos(): Promise<{
  client: RealtimeClient;
  subscription: MaterializedLiveQuerySubscription<Todo>;
  stopRenewal: () => void;
}> {
  let authorization = await authorizeTodos();
  const client = createRealtimeClient({ url: authorization.websocketUrl });
  const subscription = client.subscribe(authorization.query);
  let refreshTimer: number | undefined;

  subscription.onChange((snapshot) => updateFromRealtime(snapshot));
  scheduleRenewal();

  return {
    client,
    subscription,
    stopRenewal: () => clearTimeout(refreshTimer),
  };

  function scheduleRenewal(): void {
    clearTimeout(refreshTimer);
    const delay = Math.max(
      0,
      authorization.query.expiresAt - Date.now() - 10_000,
    );
    refreshTimer = window.setTimeout(renew, delay);
  }

  async function renew(): Promise<void> {
    try {
      authorization = await authorizeTodos();
      await subscription.renew(authorization.query);
      streamError = undefined;
      showError();
      scheduleRenewal();
    } catch (cause) {
      streamError =
        cause instanceof Error ? cause.message : "Authorization refresh failed";
      showError();
      refreshTimer = window.setTimeout(renew, 1_000);
    }
  }
}

function updateFromRealtime(snapshot: LiveQuerySnapshot<Todo>): void {
  status.textContent = snapshot.status;
  setStatusColor(snapshot.status);
  streamError = snapshot.error?.message;
  if (snapshot.data) authoritativeTodos = snapshot.data;
  renderTodos();
  showError();
}

function mutate(
  action: OptimisticAction,
  operation: () => Promise<MutationResponse>,
  onFailure?: () => void,
): void {
  const activeSubscription = subscription;
  if (!activeSubscription) return;
  mutationError = undefined;
  const actionId = nextActionId++;
  optimisticActions.set(actionId, action);
  renderTodos();
  showError();

  void operation()
    .then(({ txid }) => activeSubscription.awaitTxId(txid, 10_000))
    .catch((cause: unknown) => {
      mutationError =
        cause instanceof Error ? cause.message : "The mutation failed";
      onFailure?.();
    })
    .finally(() => {
      optimisticActions.delete(actionId);
      cleanupPersistedId(action);
      renderTodos();
      showError();
    });
}

function renderTodos(): void {
  const todos = [...authoritativeTodos];
  for (const action of optimisticActions.values()) {
    switch (action.type) {
      case "add": {
        const id = optimisticId(action.todo.id);
        if (!todos.some((todo) => todo.id === id)) {
          todos.push({ ...action.todo, id });
        }
        break;
      }
      case "set-completed": {
        const id = optimisticId(action.id);
        const index = todos.findIndex((todo) => todo.id === id);
        if (index !== -1) {
          todos[index] = { ...todos[index], completed: action.completed };
        }
        break;
      }
      case "delete": {
        const id = optimisticId(action.id);
        const index = todos.findIndex((todo) => todo.id === id);
        if (index !== -1) todos.splice(index, 1);
        break;
      }
    }
  }
  list.replaceChildren(...todos.map(todoElement));
}

function todoElement(todo: Todo): HTMLLIElement {
  const item = document.createElement("li");
  item.className =
    "grid grid-cols-[1fr_auto] items-center gap-4 border-b border-emerald-950/10 px-0.5 py-3.5 dark:border-zinc-800";

  const label = document.createElement("label");
  label.className = "flex min-w-0 items-center gap-3";

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = todo.completed;
  toggle.dataset.action = "toggle";
  toggle.dataset.id = String(todo.id);
  toggle.className = "m-0 size-4.5 accent-emerald-500";
  toggle.setAttribute(
    "aria-label",
    `Mark ${todo.title} as ${todo.completed ? "incomplete" : "complete"}`,
  );

  const text = document.createElement("span");
  text.textContent = todo.title;
  if (todo.completed) {
    text.className = "text-zinc-500 line-through dark:text-zinc-500";
  }

  const remove = document.createElement("button");
  remove.type = "button";
  remove.dataset.action = "delete";
  remove.dataset.id = String(todo.id);
  remove.className =
    "cursor-pointer bg-transparent p-2 text-xs font-medium text-zinc-500 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:text-zinc-400 dark:hover:text-red-400";
  remove.textContent = "Delete";
  remove.setAttribute("aria-label", `Delete ${todo.title}`);

  label.append(toggle, text);
  item.append(label, remove);
  return item;
}

function optimisticId(id: Todo["id"]): Todo["id"] {
  return persistedIds.get(id) ?? id;
}

async function persistedId(id: Todo["id"]): Promise<Todo["id"]> {
  if (id >= 0) return id;
  const known = persistedIds.get(id);
  if (known !== undefined) return known;
  const pending = pendingCreates.get(id);
  if (!pending) throw new Error("The todo is no longer being created");
  return (await pending).id;
}

function cleanupPersistedId(action: OptimisticAction): void {
  const id = action.type === "add" ? action.todo.id : action.id;
  if (id >= 0) return;
  const stillPending = [...optimisticActions.values()].some((candidate) =>
    candidate.type === "add" ? candidate.todo.id === id : candidate.id === id,
  );
  if (!stillPending) persistedIds.delete(id);
}

async function authorizeTodos(): Promise<LiveTodosResponse> {
  return requestJson<LiveTodosResponse>("/api/todos/live");
}

async function createTodo(title: string): Promise<CreateTodoResponse> {
  return requestJson<CreateTodoResponse>("/api/todos", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

async function toggleTodo(id: number): Promise<MutationResponse> {
  return requestJson<MutationResponse>(`/api/todos/${id}`, {
    method: "PATCH",
  });
}

async function deleteTodo(id: number): Promise<MutationResponse> {
  return requestJson<MutationResponse>(`/api/todos/${id}`, {
    method: "DELETE",
  });
}

async function requestJson<Result>(
  path: string,
  init?: RequestInit,
): Promise<Result> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      { error?: unknown } | undefined;
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `Request failed (${response.status})`,
    );
  }
  return response.json() as Promise<Result>;
}

function setStatusColor(value: string): void {
  status.className =
    value === "live"
      ? "mb-4.5 text-[13px] text-emerald-700 dark:text-emerald-400"
      : value === "error"
        ? "mb-4.5 text-[13px] text-red-700 dark:text-red-400"
        : "mb-4.5 text-[13px] text-zinc-500 dark:text-zinc-400";
}

function showError(): void {
  const message = mutationError ?? streamError;
  error.hidden = !message;
  error.textContent = message ?? "";
}

function element<ElementType extends HTMLElement>(id: string): ElementType {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing #${id}`);
  return value as ElementType;
}
