import { useLiveQuery } from "@neon/realtime-react";
import { type FormEvent, useCallback, useState } from "react";

import { createTodo, deleteTodo, getLiveTodos } from "./api.js";

type LiveTodosQuery = Awaited<ReturnType<typeof getLiveTodos>>["query"];

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
  const [mutationError, setMutationError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") ?? "").trim();
    if (!title) return;
    form.reset();
    await mutate(async () => {
      const result = await createTodo(title);
      await utils.awaitTxId(result.txid, 10_000);
    });
  }

  async function removeTodo(id: number) {
    await mutate(async () => {
      const result = await deleteTodo(id);
      if ("txid" in result) await utils.awaitTxId(result.txid, 10_000);
    });
  }

  async function mutate(operation: () => Promise<void>) {
    setPending(true);
    setMutationError(undefined);
    try {
      await operation();
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : "The mutation failed",
      );
    } finally {
      setPending(false);
    }
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
        Open this page in two tabs. Changes made in either tab arrive through a
        typed live Drizzle query.
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
        {todos?.map((todo) => (
          <li key={todo.id}>
            <span>{todo.title}</span>
            <button
              aria-label={`Delete ${todo.title}`}
              className="delete"
              disabled={pending}
              onClick={() => void removeTodo(todo.id)}
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
