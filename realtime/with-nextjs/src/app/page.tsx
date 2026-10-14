import { Suspense } from "react";

import { Todos } from "./todos";

// No data access here: the static shell renders at once and <Todos /> streams in at request time.
export default function Page() {
  return (
    <main className="min-h-screen bg-emerald-50 px-4 py-18 text-emerald-950 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto w-full max-w-2xl">
        <header>
          <p className="m-0 text-xs font-extrabold tracking-[0.08em] text-emerald-700 uppercase dark:text-emerald-400">
            Next.js SSR + Neon Realtime
          </p>
          <h1 className="mt-1 mb-3 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
            Your todos
          </h1>
        </header>

        <p className="mb-7 max-w-xl leading-relaxed text-zinc-600 dark:text-zinc-400">
          This list is server-rendered and belongs to you. Open it in two tabs:
          changes appear here immediately and arrive in the other tab through a
          typed live Kysely query.
        </p>

        <Suspense fallback={<TodosSkeleton />}>
          <Todos />
        </Suspense>
      </div>
    </main>
  );
}

// The same height as the form plus three rows (classes from todo-list.tsx), so the page doesn't jump when the
// list streams in. The two empty slots stand in for the list's reserved status and message slots.
function TodosSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading todos" className="animate-pulse">
      <div aria-hidden="true" className="h-5" />
      <div aria-hidden="true" className="mt-2 mb-3 h-12" />
      <div aria-hidden="true" className="flex gap-2">
        <div className="min-w-0 flex-1 rounded-xl border border-emerald-950/20 bg-white px-3.5 py-3 dark:border-zinc-700 dark:bg-zinc-900">
          &nbsp;
        </div>
        <div className="rounded-xl bg-emerald-500/40 px-4 py-3 font-bold text-transparent">
          Add item
        </div>
      </div>
      <ul aria-hidden="true" className="my-5 list-none p-0">
        {[0, 1, 2].map((row) => (
          <li
            className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-emerald-950/10 px-0.5 py-3.5 dark:border-zinc-800"
            key={row}
          >
            <span className="h-4 w-1/2 rounded bg-emerald-950/10 dark:bg-zinc-800" />
            <span className="p-2 text-xs text-transparent">Delete</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
