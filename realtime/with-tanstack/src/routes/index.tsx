import { createRealtimeClient } from "@neon/realtime/client";
import type { RealtimeCollectionUtils } from "@neon/realtime-tanstack";
import type { Collection, DehydratedDbState } from "@tanstack/db";
import { DbClient, useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMemo, useState, type FormEvent } from "react";

import type { Todo } from "../schema";
import { createTodoCollection } from "../todo-collection";

const loadTodosPage = createServerFn({ method: "GET" }).handler(async () => {
  const { env } = await import("../env.server");
  const { realtime } = await import("../realtime.server");
  const { selectTodos } = await import("../todos.server");
  const [initialTodos, query] = await Promise.all([
    selectTodos(),
    realtime.seal({ query: selectTodos() }),
  ]);

  const realtimeClient = createRealtimeClient({ url: env.realtime.url });
  const dbClient = new DbClient({ runtime: "server" });
  dbClient.collection(createTodoCollection(realtimeClient, query), {
    initialData: [...initialTodos],
  });
  const dbState = dbClient.dehydrate() as unknown as TodoDbState;
  await dbClient.cleanup();
  realtimeClient.close();

  return { dbState, query, websocketUrl: env.realtime.url };
});

export const Route = createFileRoute("/")({
  loader: () => loadTodosPage(),
  component: TodosRoute,
});

function TodosRoute() {
  const { dbState, query, websocketUrl } = Route.useLoaderData();
  const { dbClient } = Route.useRouteContext();
  const [hydratedDbClient] = useState(() => {
    dbClient.hydrate(dbState as unknown as DehydratedDbState);
    return dbClient;
  });
  const [realtimeClient] = useState(() =>
    createRealtimeClient({ url: websocketUrl }),
  );
  const descriptor = useMemo(
    () => createTodoCollection(realtimeClient, query),
    [query, realtimeClient],
  );
  const collection = hydratedDbClient.collection(descriptor);
  const { data: todos, isReady } = useLiveQuery({
    query: (q) =>
      q.from({ todo: descriptor }).orderBy(({ todo }) => todo.id, "asc"),
  });

  return <TodoList collection={collection} isReady={isReady} todos={todos} />;
}

function TodoList({
  collection,
  isReady,
  todos,
}: {
  readonly collection: Collection<
    Todo,
    number,
    RealtimeCollectionUtils,
    never,
    Todo
  >;
  readonly isReady: boolean;
  readonly todos: readonly Todo[];
}) {
  function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") ?? "").trim();
    if (!title) return;
    form.reset();
    collection.insert({ id: randomId(), title, completed: false });
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
              Shared todos
            </h1>
          </div>
          <output
            className={`mb-4.5 text-[13px] ${isReady ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"}`}
          >
            {isReady ? "live" : "loading"}
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
                  onChange={(event) =>
                    collection.update(todo.id, (draft) => {
                      draft.completed = event.currentTarget.checked;
                    })
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
                className="cursor-pointer bg-transparent p-2 text-xs font-medium text-zinc-500 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:text-zinc-400 dark:hover:text-red-400"
                onClick={() => collection.delete(todo.id)}
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

function randomId(): number {
  const value = crypto.getRandomValues(new Uint32Array(1))[0]! & 0x7fff_ffff;
  return value || 1;
}

interface TodoDbState {
  readonly collections: readonly {
    readonly collectionId: string;
    readonly rows: readonly {
      readonly key: number;
      readonly value: Todo;
    }[];
  }[];
}
