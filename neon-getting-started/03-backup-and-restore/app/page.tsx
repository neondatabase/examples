import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { categories, todos, type Category } from "@/db/schema";
import { addTodo } from "./actions";
import { CategoryPicker } from "./category-picker";
import { DueDatePicker } from "./due-date-picker";
import { TodoItem } from "./todo-item";

async function safeLoadCategories(): Promise<Category[]> {
  // If the categories table has been dropped (for a backup/recovery drill,
  // or because it hasn't been migrated yet), we don't want to take the whole
  // app down. Fall back to an empty list so todos keep working.
  try {
    return await db.select().from(categories).orderBy(asc(categories.name));
  } catch (error) {
    console.warn(
      "Could not load categories — continuing without them.",
      error,
    );
    return [];
  }
}

export default async function Home() {
  const [allTodos, allCategories] = await Promise.all([
    db.select().from(todos).orderBy(desc(todos.createdAt)),
    safeLoadCategories(),
  ]);

  const categoryById = new Map(
    allCategories.map((category) => [category.id, category]),
  );

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="flex w-full max-w-lg flex-col gap-4 px-4 py-8 sm:gap-6 sm:px-6 sm:py-12 md:max-w-xl md:py-16">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl dark:text-zinc-50">
            Todos
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            A simple todo list powered by Neon &amp; Drizzle
          </p>
        </div>

        <form action={addTodo} className="flex flex-col gap-3">
          <input
            type="text"
            name="text"
            placeholder="What needs to be done?"
            required
            autoComplete="off"
            className="min-w-0 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-emerald-500"
          />
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
            <DueDatePicker />
            <CategoryPicker categories={allCategories} />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600 active:bg-emerald-700"
            >
              Add
            </button>
          </div>
        </form>

        {allTodos.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
            No todos yet. Add one above to get started.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {allTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                {...todo}
                category={
                  todo.categoryId ? categoryById.get(todo.categoryId) : undefined
                }
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
