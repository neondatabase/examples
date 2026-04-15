import { desc } from "drizzle-orm";
import { db } from "@/db";
import { todos } from "@/db/schema";
import { addTodo } from "./actions";
import { TodoItem } from "./todo-item";

export default async function Home() {
  const allTodos = await db.select().from(todos).orderBy(desc(todos.createdAt));

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="flex w-full max-w-lg flex-col gap-6 px-4 py-16">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Todos
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            A simple todo list powered by Neon &amp; Drizzle
          </p>
        </div>

        <form action={addTodo} className="flex gap-2">
          <input
            type="text"
            name="text"
            placeholder="What needs to be done?"
            required
            autoComplete="off"
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-emerald-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 active:bg-emerald-700"
          >
            Add
          </button>
        </form>

        {allTodos.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
            No todos yet. Add one above to get started.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {allTodos.map((todo) => (
              <TodoItem key={todo.id} {...todo} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
