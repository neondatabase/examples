"use client";

import { useCallback, useState, type FormEvent } from "react";
import { createRealtimeClient } from "@neon/realtime/client";
import { RealtimeProvider, useLiveQuery } from "@neon/realtime-react";

import type {
  CreateTodoRequest,
  SealedTodosQuery,
  UpdateTodoRequest,
} from "../lib/api-types";
import type { Todo } from "../lib/schema";

export function TodosClient(props: {
  readonly query: SealedTodosQuery;
  readonly initialTodos: readonly Todo[];
}) {
  const [client] = useState(() =>
    createRealtimeClient({
      url: requiredPublicUrl(),
    }),
  );

  return (
    <RealtimeProvider client={client}>
      <TodoList {...props} />
    </RealtimeProvider>
  );
}

function TodoList({
  query,
  initialTodos,
}: {
  readonly query: SealedTodosQuery;
  readonly initialTodos: readonly Todo[];
}) {
  const refreshQuery = useCallback(sealTodos, []);
  const {
    data: todos,
    status,
    error,
  } = useLiveQuery(query, {
    initialData: initialTodos,
    refreshQuery,
  });
  const [mutationError, setMutationError] = useState<string>();

  async function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") ?? "").trim();
    if (!title) return;
    const saved = await request("/api/todos", {
      method: "POST",
      body: JSON.stringify({ title } satisfies CreateTodoRequest),
    });
    if (saved) form.reset();
  }

  async function toggle(todo: Todo) {
    const nextStatus = todo.status === "completed" ? "active" : "completed";
    await request(`/api/todos/${todo.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus } satisfies UpdateTodoRequest),
    });
  }

  async function request(path: string, init: RequestInit) {
    setMutationError(undefined);
    try {
      const response = await fetch(path, {
        ...init,
        headers: { "content-type": "application/json", ...init.headers },
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      return true;
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : "Request failed",
      );
      return false;
    }
  }

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">Next.js SSR</p>
          <h1>Neon Realtime Todos</h1>
        </div>
        <output className={`status ${status}`}>{status}</output>
      </header>

      <form onSubmit={addTodo}>
        <input name="title" placeholder="What needs doing?" required />
        <button type="submit">Add todo</button>
      </form>

      {(error || mutationError) && (
        <p className="error">{error?.message ?? mutationError}</p>
      )}

      <ul aria-live="polite">
        {(todos ?? []).map((todo) => (
          <li className={todo.status} key={todo.id}>
            <button
              aria-label={`Mark ${todo.title} ${todo.status === "completed" ? "active" : "completed"}`}
              className="toggle"
              onClick={() => void toggle(todo)}
            >
              {todo.status === "completed" ? "✓" : "○"}
            </button>
            <span>{todo.title}</span>
            <button
              className="delete"
              onClick={() =>
                void request(`/api/todos/${todo.id}`, { method: "DELETE" })
              }
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

async function sealTodos(): Promise<SealedTodosQuery> {
  const response = await fetch("/api/todos/live");
  if (!response.ok) throw new Error("Could not authorize the todo query");
  return response.json() as Promise<SealedTodosQuery>;
}

function requiredPublicUrl(): string {
  const value = process.env.NEXT_PUBLIC_NEON_REALTIME_URL;
  if (!value) throw new Error("Missing NEXT_PUBLIC_NEON_REALTIME_URL");
  return value;
}
