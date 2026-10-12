import { useState, type FormEvent } from "react";
import { useLiveQuery } from "@neon/realtime-react";

import type {
  CreateTodoRequest,
  SealedTodosQuery,
  UpdateTodoRequest,
} from "./api-types.js";
import type { Todo } from "./schema.js";

export function TodoApp({
  query,
  refreshQuery,
}: {
  readonly query: SealedTodosQuery;
  readonly refreshQuery: () => Promise<SealedTodosQuery>;
}) {
  const {
    data: todos,
    status,
    error,
  } = useLiveQuery(query, {
    refreshQuery,
  });
  const [mutationError, setMutationError] = useState<string>();

  async function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return;
    form.reset();
    await request("/api/todos", {
      method: "POST",
      body: JSON.stringify({ title } satisfies CreateTodoRequest),
    });
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
    const response = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
    if (!response.ok) setMutationError(`Request failed (${response.status})`);
  }

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">React + Kysely</p>
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
