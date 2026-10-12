import { useMemo, useState, type FormEvent } from "react";
import { DbClient, useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createRealtimeClient } from "@neon/realtime/client";
import type { Collection, DehydratedDbState } from "@tanstack/db";
import type { RealtimeCollectionUtils } from "@neon/realtime-tanstack";

import { createTodoCollection } from "../todo-collection";
import type { Todo } from "../schema";

const loadTodosPage = createServerFn({ method: "GET" }).handler(async () => {
  const { realtime } = await import("../realtime.server");
  const { allTodos } = await import("../todos.server");
  const [initialTodos, query] = await Promise.all([
    allTodos(),
    realtime.seal({ query: allTodos() }),
  ]);

  const liveClient = createRealtimeClient({ url: liveUrl() });
  const dbClient = new DbClient({ runtime: "server" });
  dbClient.collection(createTodoCollection(liveClient, query), {
    initialData: [...initialTodos],
  });
  // The seeded collection contains only this JSON-safe row shape. Narrowing
  // TanStack's generic `unknown` metadata type lets Start prove serializability.
  const dbState = dbClient.dehydrate() as unknown as TodoDbState;
  await dbClient.cleanup();
  liveClient.close();

  return { query, dbState };
});

export const Route = createFileRoute("/")({
  loader: () => loadTodosPage(),
  component: TodosRoute,
});

function TodosRoute() {
  const { query, dbState } = Route.useLoaderData();
  const { dbClient } = Route.useRouteContext();
  const [hydratedDbClient] = useState(() => {
    dbClient.hydrate(dbState as unknown as DehydratedDbState);
    return dbClient;
  });
  const [liveClient] = useState(() => createRealtimeClient({ url: liveUrl() }));

  const descriptor = useMemo(
    () => createTodoCollection(liveClient, query),
    [query, liveClient],
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
    collection.insert({ id: randomId(), title, status: "active" });
  }

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">TanStack Start + DB</p>
          <h1>Neon Realtime Todos</h1>
        </div>
        <output className={`status ${isReady ? "live" : "loading"}`}>
          {isReady ? "live" : "loading"}
        </output>
      </header>

      <form onSubmit={addTodo}>
        <input name="title" placeholder="What needs doing?" required />
        <button type="submit">Add todo</button>
      </form>

      <ul aria-live="polite">
        {todos.map((todo) => (
          <li className={todo.status} key={todo.id}>
            <button
              aria-label={`Mark ${todo.title} ${todo.status === "completed" ? "active" : "completed"}`}
              className="toggle"
              onClick={() =>
                collection.update(todo.id, (draft) => {
                  draft.status =
                    todo.status === "completed" ? "active" : "completed";
                })
              }
            >
              {todo.status === "completed" ? "✓" : "○"}
            </button>
            <span>{todo.title}</span>
            <button
              className="delete"
              onClick={() => collection.delete(todo.id)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

function randomId(): number {
  const value = crypto.getRandomValues(new Uint32Array(1))[0]! & 0x7fff_ffff;
  return value || 1;
}

function liveUrl(): string {
  const value = import.meta.env.VITE_NEON_REALTIME_URL;
  if (!value) throw new Error("Missing VITE_NEON_REALTIME_URL");
  return value;
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
