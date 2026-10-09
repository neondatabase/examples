import type { SealedLiveQuery } from "@neon/realtime/client";
import { useLiveQuery } from "@neon/realtime-react";
import {
  type FormEvent,
  useCallback,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";

import { createTodo, deleteTodo, getLiveTodos, updateTodo } from "./api.js";

type LiveTodosQuery = Awaited<ReturnType<typeof getLiveTodos>>["query"];
type Todo = LiveTodosQuery extends SealedLiveQuery<infer Row> ? Row : never;
type OptimisticAction =
  | { readonly type: "add"; readonly todo: Todo }
  | {
      readonly type: "complete";
      readonly id: Todo["id"];
      readonly value: Todo["completed"];
    }
  | { readonly type: "delete"; readonly id: Todo["id"] };

function applyOptimisticAction(
  todos: readonly Todo[],
  action: OptimisticAction,
): readonly Todo[] {
  switch (action.type) {
    case "add":
      return [...todos, action.todo];
    case "complete":
      return todos.map((todo) =>
        todo.id === action.id ? { ...todo, completed: action.value } : todo,
      );
    case "delete":
      return todos.filter((todo) => todo.id !== action.id);
  }
}

export function App({ query }: { readonly query: LiveTodosQuery }) {
  const refreshQuery = useCallback(
    async () => (await getLiveTodos()).query,
    [],
  );
  const {
    data: todos,
    status,
    error,
    utils,
  } = useLiveQuery(query, {
    refreshQuery,
  });
  const [optimisticTodos, updateOptimistically] = useOptimistic(
    todos ?? [],
    applyOptimisticAction,
  );
  const nextOptimisticId = useRef(-1);
  const [mutationError, setMutationError] = useState<string>();
  const [pending, startMutation] = useTransition();

  function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") ?? "").trim();
    if (!title) return;
    form.reset();
    mutate(
      {
        type: "add",
        todo: { id: nextOptimisticId.current--, title, completed: false },
      },
      async () => {
        const result = await createTodo(title);
        await utils.awaitTxId(result.txid, 10_000);
      },
    );
  }

  function setCompleted(id: Todo["id"], completed: Todo["completed"]) {
    mutate({ type: "complete", id, value: completed }, async () => {
      const result = await updateTodo(id, completed);
      await utils.awaitTxId(result.txid, 10_000);
    });
  }

  function removeTodo(id: Todo["id"]) {
    mutate({ type: "delete", id }, async () => {
      const result = await deleteTodo(id);
      if ("txid" in result) await utils.awaitTxId(result.txid, 10_000);
    });
  }

  function mutate(action: OptimisticAction, operation: () => Promise<void>) {
    setMutationError(undefined);
    startMutation(async () => {
      updateOptimistically(action);
      try {
        await operation();
      } catch (cause) {
        setMutationError(
          cause instanceof Error ? cause.message : "The mutation failed",
        );
      }
    });
  }

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">Neon Realtime</p>
          <h1>Shared todos</h1>
        </div>
        <output className={`status ${status}`}>{status}</output>
      </header>

      <p className="lede">
        Open this page in two tabs. Changes appear here immediately and arrive
        in the other tab through a typed live Drizzle query.
      </p>

      <form onSubmit={addTodo}>
        <input
          aria-label="Todo title"
          disabled={pending}
          maxLength={200}
          name="title"
          placeholder="What needs doing?"
          required
        />
        <button disabled={pending} type="submit">
          Add item
        </button>
      </form>

      {(error || mutationError) && (
        <p className="error">{error?.message ?? mutationError}</p>
      )}

      <ul aria-live="polite">
        {optimisticTodos.map((todo) => (
          <li key={todo.id}>
            <label className="todo">
              <input
                aria-label={`Mark ${todo.title} as ${todo.completed ? "incomplete" : "complete"}`}
                checked={todo.completed}
                disabled={pending}
                onChange={(event) =>
                  setCompleted(todo.id, event.currentTarget.checked)
                }
                type="checkbox"
              />
              <span className={todo.completed ? "completed" : undefined}>
                {todo.title}
              </span>
            </label>
            <button
              aria-label={`Delete ${todo.title}`}
              className="delete"
              disabled={pending}
              onClick={() => removeTodo(todo.id)}
              type="button"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
