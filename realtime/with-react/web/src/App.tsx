import type { SealedLiveQuery } from "@neon/realtime/client";
import { useLiveQuery } from "@neon/realtime-react";
import {
  type FormEvent,
  startTransition,
  useCallback,
  useOptimistic,
  useState,
} from "react";

import { createTodo, deleteTodo, getLiveTodos, toggleTodo } from "./api.js";

type LiveTodosQuery = Awaited<ReturnType<typeof getLiveTodos>>["query"];
type Todo = LiveTodosQuery extends SealedLiveQuery<infer Row> ? Row : never;
type OptimisticTodo = Todo & { readonly pending?: boolean };
type MutationResult = Awaited<
  ReturnType<typeof createTodo | typeof toggleTodo | typeof deleteTodo>
>;
type OptimisticAction =
  | { readonly type: "add"; readonly todo: Todo }
  | {
      readonly type: "toggle";
      readonly id: Todo["id"];
      readonly completed: boolean;
    }
  | { readonly type: "delete"; readonly id: Todo["id"] };

// React reapplies pending actions whenever `todos` changes, and the synced row
// can arrive before the action's transition ends. So each case must also be
// right for rows that already include the change.
function applyOptimisticAction(
  todos: readonly OptimisticTodo[],
  action: OptimisticAction,
): readonly OptimisticTodo[] {
  switch (action.type) {
    case "add":
      if (todos.some((todo) => todo.id === action.todo.id)) return todos;
      return [{ ...action.todo, pending: true }, ...todos];
    case "toggle":
      return todos.map((todo) =>
        todo.id === action.id
          ? { ...todo, completed: action.completed, pending: true }
          : todo,
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
  const [optimisticTodos, updateOptimistically] = useOptimistic<
    readonly OptimisticTodo[],
    OptimisticAction
  >(todos ?? [], applyOptimisticAction);
  const [mutationError, setMutationError] = useState<string>();

  function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") ?? "").trim();
    if (!title) return;
    form.reset();
    const todo = { id: crypto.randomUUID(), title, completed: false };
    mutate({ type: "add", todo }, () => createTodo(todo.id, todo.title));
  }

  function toggleCompleted(id: Todo["id"], completed: boolean) {
    mutate({ type: "toggle", id, completed }, () => toggleTodo(id, completed));
  }

  function removeTodo(id: Todo["id"]) {
    mutate({ type: "delete", id }, () => deleteTodo(id));
  }

  function mutate(
    action: OptimisticAction,
    write: () => Promise<MutationResult>,
  ) {
    setMutationError(undefined);
    startTransition(async () => {
      updateOptimistically(action);
      try {
        const { txid } = await write();
        await utils.awaitTxId(txid, 10_000);
      } catch (cause) {
        setMutationError(
          cause instanceof Error ? cause.message : "The mutation failed",
        );
      }
    });
  }

  const statusColor =
    status === "live"
      ? "text-emerald-700 dark:text-emerald-400"
      : status === "error"
        ? "text-red-700 dark:text-red-400"
        : "text-zinc-500 dark:text-zinc-400";

  return (
    <main className="min-h-screen bg-emerald-50 px-4 py-18 text-emerald-950 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto w-full max-w-2xl">
        <header className="flex items-end justify-between gap-6">
          <div>
            <p className="m-0 text-xs font-extrabold tracking-[0.08em] text-emerald-700 uppercase dark:text-emerald-400">
              Neon Realtime
            </p>
            <h1 className="mt-1 mb-3 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
              Shared todos
            </h1>
          </div>
          <output className={`mb-4.5 text-[13px] ${statusColor}`}>
            {status}
          </output>
        </header>

        <p className="mb-7 max-w-xl leading-relaxed text-zinc-600 dark:text-zinc-400">
          Open this page in two tabs. Changes appear here immediately and arrive
          in the other tab through a typed live Drizzle query.
        </p>

        <form className="flex gap-2" onSubmit={addTodo}>
          <input
            aria-label="Todo title"
            className="min-w-0 flex-1 rounded-xl border border-emerald-950/20 bg-white px-3.5 py-3 text-emerald-950 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            maxLength={200}
            name="title"
            placeholder="What needs doing?"
            required
          />
          <button
            className="cursor-pointer rounded-xl bg-emerald-500 px-4 py-3 font-bold text-emerald-950 hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
            type="submit"
          >
            Add item
          </button>
        </form>

        {(error || mutationError) && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-red-700 dark:bg-red-950 dark:text-red-300">
            {error?.message ?? mutationError}
          </p>
        )}

        <ul aria-live="polite" className="my-5 list-none p-0">
          {optimisticTodos.map((todo) => (
            <li
              aria-busy={todo.pending}
              className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-emerald-950/10 px-0.5 py-3.5 dark:border-zinc-800"
              key={todo.id}
            >
              <label className="flex min-w-0 items-center gap-3">
                <input
                  aria-label={`Mark ${todo.title} as ${todo.completed ? "incomplete" : "complete"}`}
                  checked={todo.completed}
                  className="m-0 size-4.5 accent-emerald-500"
                  disabled={todo.pending}
                  onChange={(event) =>
                    toggleCompleted(todo.id, event.currentTarget.checked)
                  }
                  type="checkbox"
                />
                <span
                  className={
                    todo.completed
                      ? "text-zinc-500 line-through dark:text-zinc-500"
                      : undefined
                  }
                >
                  {todo.title}
                </span>
              </label>
              <button
                aria-label={`Delete ${todo.title}`}
                className="cursor-pointer bg-transparent p-2 text-xs font-medium text-zinc-500 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:cursor-default disabled:opacity-50 dark:text-zinc-400 dark:hover:text-red-400"
                disabled={todo.pending}
                onClick={() => removeTodo(todo.id)}
                type="button"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
