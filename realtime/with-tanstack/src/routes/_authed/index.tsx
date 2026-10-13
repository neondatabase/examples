import {
  useDbClient,
  useLiveQuery,
  type Transaction,
} from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { NotSyncedYetError, todosCollection } from "../../todos.collection";
import { loadTodos } from "../../todos.functions";

type Notice = { tone: "error" | "info"; text: string };

export const Route = createFileRoute("/_authed/")({
  // Don't refetch on a navigation back here while the collection is live.
  // No visible effect until the app has a second page.
  staleTime: Infinity,
  // Fills the router's DbClient. On the server, routerWithDbClient snapshots
  // these rows into the HTML and restores them in the browser before render.
  loader: async ({ context }) => {
    const { rows, query } = await loadTodos();
    // A no-op if this user's collection already exists.
    context.dbClient.collection(todosCollection(context.user.id, query), {
      initialData: rows,
    });
    return { query };
  },
  component: TodosPage,
});

function TodosPage() {
  const { query } = Route.useLoaderData();
  const { user } = Route.useRouteContext();
  // Same id as the loader's, so this resolves to the collection it filled.
  const descriptor = todosCollection(user.id, query);
  const collection = useDbClient().collection(descriptor);
  // `isReady` turns true when Realtime sends its first complete result, and
  // stays true while it reconnects or renews the query. The SSR rows are on
  // screen before that.
  const { data: todos, isReady } = useLiveQuery({
    query: (q) =>
      q
        .from({ todo: descriptor })
        .orderBy(({ todo }) => todo.createdAt, "desc")
        .orderBy(({ todo }) => todo.id, "desc"),
  });
  const [notice, setNotice] = useState<Notice | null>(null);

  // Changes apply optimistically. If one fails, TanStack DB rolls it back and
  // the reason shows here.
  function track(tx: Transaction) {
    setNotice(null);
    tx.when("settled").catch((cause: unknown) =>
      setNotice(
        cause instanceof NotSyncedYetError
          ? {
              tone: "info",
              text: "Saved. It will appear when live updates reconnect.",
            }
          : {
              tone: "error",
              text: `Couldn't save that change: ${cause instanceof Error ? cause.message : String(cause)}`,
            },
      ),
    );
  }

  function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") ?? "").trim();
    if (!title) return;
    form.reset();
    track(
      collection.insert({
        id: crypto.randomUUID(),
        title,
        completed: false,
        createdAt: new Date(),
      }),
    );
  }

  return (
    <main className="min-h-screen bg-emerald-50 px-4 py-18 text-emerald-950 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto w-full max-w-2xl">
        <header className="flex items-end justify-between gap-6">
          <div>
            <p className="m-0 text-xs font-extrabold tracking-[0.08em] text-emerald-700 uppercase dark:text-emerald-400">
              TanStack Start + DB + Neon Realtime
            </p>
            <h1 className="mt-1 mb-3 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
              Your todos
            </h1>
          </div>
          <output
            className={`mb-4.5 text-[13px] ${isReady ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"}`}
          >
            {isReady ? "live" : "connecting"}
          </output>
        </header>

        <p className="mb-7 max-w-xl leading-relaxed text-zinc-600 dark:text-zinc-400">
          This TanStack DB collection is hydrated by SSR. Open it in two tabs:
          mutations are optimistic here and arrive in the other tab through a
          typed live Drizzle query.
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

        {notice ? (
          <p
            className={`mt-3 mb-0 text-[13px] ${notice.tone === "error" ? "text-red-600 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}`}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        ) : null}

        <ul aria-live="polite" className="my-5 list-none p-0">
          {todos.map((todo) => (
            <li
              className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-emerald-950/10 px-0.5 py-3.5 dark:border-zinc-800"
              key={todo.id}
            >
              <label className="flex min-w-0 items-center gap-3">
                <input
                  aria-label={`Mark ${todo.title} as ${todo.completed ? "incomplete" : "complete"}`}
                  checked={todo.completed}
                  className="m-0 size-4.5 accent-emerald-500"
                  // Off until the row's last change is confirmed, like Delete.
                  // Handlers run concurrently, so a change sent before the
                  // insert commits could match no rows and be lost.
                  disabled={todo.$hasPendingWrites}
                  onChange={() =>
                    track(
                      collection.update(todo.id, (draft) => {
                        draft.completed = !draft.completed;
                      }),
                    )
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
                className="cursor-pointer bg-transparent p-2 text-xs font-medium text-zinc-500 hover:text-red-600 disabled:cursor-default disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:text-zinc-400 dark:hover:text-red-400"
                disabled={todo.$hasPendingWrites}
                onClick={() => track(collection.delete(todo.id))}
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
