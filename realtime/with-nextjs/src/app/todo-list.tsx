"use client";

import type { SealedLiveQuery } from "@neon/realtime/client";
// @neon/realtime-react's build has no "use client" directive: import it only from client modules.
import { useLiveQuery } from "@neon/realtime-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
} from "react";

import type { TodoRow } from "@/lib/todos"; // type-only: erased at build, so no server code reaches the browser

import {
  addTodo,
  deleteTodo,
  setTodoCompleted,
  type WriteResult,
} from "./actions";
import { LocalTime } from "./local-time";

type OptimisticTodo = TodoRow & { pending?: true };
type OptimisticAction =
  | { type: "add"; todo: TodoRow }
  | { type: "toggle"; id: string; completed: boolean }
  | { type: "delete"; id: string };
type Notice = { tone: "error" | "info"; text: string };

// React re-applies pending actions to every new live snapshot, including one that already contains the
// change. So each case must be safe to re-run, and must set absolute values.
function applyOptimisticAction(
  todos: readonly OptimisticTodo[],
  action: OptimisticAction,
): readonly OptimisticTodo[] {
  switch (action.type) {
    case "add":
      return todos.some((t) => t.id === action.todo.id)
        ? todos
        : [{ ...action.todo, pending: true }, ...todos];
    case "toggle":
      // Only dim rows the stream hasn't confirmed yet.
      return todos.map((t) =>
        t.id === action.id && t.completed !== action.completed
          ? { ...t, completed: action.completed, pending: true }
          : t,
      );
    case "delete":
      return todos.filter((t) => t.id !== action.id);
  }
}

// The live rows don't follow the query's ORDER BY, so sort here. The server render and hydration run the
// same sort, so the markup matches.
// Newest first, optimistic rows included (they carry the browser's created_at until the live row replaces them).
const newestFirst = (a: OptimisticTodo, b: OptimisticTodo) =>
  b.created_at.getTime() - a.created_at.getTime() ||
  (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

// How long a write stays pending while it waits for its transaction to arrive on the stream. Keep it short:
// React holds every transition started meanwhile (router.refresh(), navigations, sign-out) until it settles.
const SYNC_TIMEOUT_MS = 10_000;

export function TodoList({
  initialTodos,
  sealedQuery,
}: {
  initialTodos: TodoRow[];
  sealedQuery: SealedLiveQuery<TodoRow>;
}) {
  const router = useRouter();

  // Keep the first sealed query. useLiveQuery restarts its subscription whenever it gets a new object, and
  // every server re-render (router.refresh(), a Server Action that sets a cookie) sends one for the same
  // query. Renewals go through refreshQuery. A different query remounts this list through the key in todos.tsx.
  const [query] = useState(sealedQuery);

  const signedOut = useRef(false);
  const refreshQuery = useCallback(async (): Promise<
    SealedLiveQuery<TodoRow>
  > => {
    // The hook retries a failed renewal every second until one succeeds. After a 401, stop calling the
    // server and go to sign-in with a full page load, which drops the Realtime client and this user's rows.
    if (signedOut.current) throw new Error("Signed out");
    const response = await fetch("/api/todos/live-query", {
      method: "POST",
      cache: "no-store",
    });
    if (response.status === 401) {
      signedOut.current = true;
      window.location.assign("/auth/sign-in");
      throw new Error("Signed out");
    }
    if (!response.ok)
      throw new Error(`Live query renewal failed: ${response.status}`);
    return (await response.json()) as SealedLiveQuery<TodoRow>;
  }, []);

  // The server render and hydration both show initialTodos with status "connecting". The socket opens after
  // hydration. refreshQuery re-seals 10 s before expiry, so a renewal on time stays "live".
  const { data, status, error, utils } = useLiveQuery(query, {
    initialData: initialTodos,
    refreshQuery,
  });

  // The first connect and every reconnect report "connecting", and "stale" means the sealed query expired
  // before a renewal landed. The label waits 500 ms before showing "Connecting…" for either, so a fast
  // connect goes from an empty slot straight to "Live" and a brief reconnect keeps the last label.
  const settled = status === "live" || status === "error";
  const [shownStatus, setShownStatus] = useState<typeof status | null>(null);
  if (settled && shownStatus !== status) setShownStatus(status); // adjust during render: no frame with the old label
  useEffect(() => {
    if (settled) return;
    const timer = setTimeout(() => setShownStatus("connecting"), 500);
    return () => clearTimeout(timer);
  }, [settled]);

  useEffect(() => {
    // The renewal came back for a different query: another user signed in on this browser, or a deploy
    // changed the SQL. Re-render, and the new fingerprint remounts this list (todos.tsx).
    if (error?.code === "QUERY_REFRESH_FAILED") router.refresh();
  }, [error, router]);

  const [optimisticTodos, updateOptimistically] = useOptimistic<
    readonly OptimisticTodo[],
    OptimisticAction
  >(data ?? initialTodos, applyOptimisticAction);
  const todos = useMemo(
    () => [...optimisticTodos].sort(newestFirst),
    [optimisticTodos],
  );
  const [notice, setNotice] = useState<Notice | null>(null);

  function mutate(
    action: OptimisticAction,
    write: () => Promise<WriteResult>,
    failure: string,
  ) {
    setNotice(null);
    startTransition(async () => {
      // The optimistic change lasts exactly as long as this transition.
      updateOptimistically(action);
      let result: WriteResult;
      try {
        result = await write();
      } catch {
        // Network failure, a deploy that removed the action, or a server error. The change rolls back.
        setNotice({ tone: "error", text: failure });
        return;
      }
      if (result.kind === "rejected") {
        if (result.reason === "UNAUTHENTICATED")
          window.location.assign("/auth/sign-in"); // a full page load, like the 401 above
        else setNotice({ tone: "error", text: failure });
        return;
      }
      if (result.kind === "unchanged") return; // nothing to wait for
      try {
        // Hold the transition until the stream has applied this transaction. The rows are published before
        // the wait resolves, so the live data already contains the write: no flicker and no duplicate.
        await utils.awaitTxId(result.txid, SYNC_TIMEOUT_MS);
      } catch {
        // Committed but not seen yet (the stream is reconnecting or has stopped, or the list unmounted).
        setNotice({
          tone: "info",
          text: "Saved. It will appear when live updates reconnect.",
        });
      }
    });
  }

  function addTodoFromForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") ?? "").trim();
    if (!title) return;
    // Reset now. <form action>'s automatic reset waits for the whole transition, which stays open until the
    // stream confirms the write, so it would erase whatever was typed in the meantime.
    form.reset();
    const todo: TodoRow = {
      id: crypto.randomUUID(),
      title,
      completed: false,
      created_at: new Date(),
    };
    mutate(
      { type: "add", todo },
      () => addTodo({ id: todo.id, title }),
      `Couldn't add "${title}".`,
    );
  }

  const toggleCompleted = (todo: OptimisticTodo, completed: boolean) =>
    mutate(
      { type: "toggle", id: todo.id, completed },
      () => setTodoCompleted({ id: todo.id, completed }),
      `Couldn't update "${todo.title}".`,
    );

  const removeTodo = (todo: OptimisticTodo) =>
    mutate(
      { type: "delete", id: todo.id },
      () => deleteTodo({ id: todo.id }),
      `Couldn't delete "${todo.title}".`,
    );

  // The status and message slots keep a fixed height, so the rows don't move when either changes.
  const statusText =
    shownStatus === "live"
      ? "Live"
      : shownStatus === "error"
        ? "Live updates stopped"
        : shownStatus
          ? "Connecting…"
          : "";
  const statusColor =
    shownStatus === "live"
      ? "text-emerald-700 dark:text-emerald-400"
      : shownStatus === "error"
        ? "text-red-700 dark:text-red-400"
        : "text-zinc-500 dark:text-zinc-400";
  // useLiveQuery can't restart a stopped query, so Reconnect reloads the page.
  const showReconnect = status === "error";

  return (
    <section>
      <div className="flex h-5 justify-end">
        <output className={`w-40 text-right text-[13px] ${statusColor}`}>
          {statusText}
        </output>
      </div>

      <div className="mt-2 mb-3 flex h-12 items-center gap-3">
        {notice && (
          <p
            className={`m-0 min-w-0 flex-1 truncate rounded-xl p-3 ${
              notice.tone === "error"
                ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                : "bg-emerald-100 text-emerald-900 dark:bg-zinc-900 dark:text-zinc-300"
            }`}
            role={notice.tone === "error" ? "alert" : "status"}
            title={notice.text}
          >
            {notice.text}
          </p>
        )}
        {showReconnect && (
          <button
            className="ml-auto cursor-pointer rounded-xl border border-red-700/30 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:border-red-400/30 dark:text-red-400 dark:hover:bg-red-950"
            onClick={() => window.location.reload()}
            type="button"
          >
            Reconnect
          </button>
        )}
      </div>

      <form className="flex gap-2" onSubmit={addTodoFromForm}>
        <input
          aria-label="Todo title"
          autoComplete="off"
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

      {todos.length === 0 ? (
        <p className="my-5 py-3.5 text-zinc-500 dark:text-zinc-400">
          No todos yet. Open this page in a second tab, then add one.
        </p>
      ) : (
        <ul aria-live="polite" className="my-5 list-none p-0">
          {todos.map((todo) => (
            <li
              className={`grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-emerald-950/10 px-0.5 py-3.5 dark:border-zinc-800 ${
                todo.pending ? "opacity-60" : ""
              }`}
              key={todo.id}
            >
              <label className="flex min-w-0 items-center gap-3">
                <input
                  aria-label={`Mark ${todo.title} as ${todo.completed ? "incomplete" : "complete"}`}
                  checked={todo.completed}
                  className="m-0 size-4.5 shrink-0 accent-emerald-500"
                  onChange={(e) =>
                    toggleCompleted(todo, e.currentTarget.checked)
                  }
                  type="checkbox"
                />
                <span
                  className={`min-w-0 break-words ${todo.completed ? "text-zinc-500 line-through dark:text-zinc-500" : ""}`}
                >
                  {todo.title}
                </span>
              </label>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                <LocalTime date={todo.created_at} />
              </span>
              <button
                aria-label={`Delete ${todo.title}`}
                className="cursor-pointer bg-transparent p-2 text-xs font-medium text-zinc-500 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:text-zinc-400 dark:hover:text-red-400"
                onClick={() => removeTodo(todo)}
                type="button"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
