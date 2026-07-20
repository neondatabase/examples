"use client";

import { useTransition } from "react";
import confetti from "canvas-confetti";
import { toggleTodo, deleteTodo } from "./actions";
import type { Category, Todo } from "@/db/schema";

type TodoItemProps = Todo & {
  category?: Category;
};

function formatDueDate(dueDate: Todo["dueDate"]) {
  if (!dueDate) return null;

  const date =
    typeof dueDate === "string" ? new Date(`${dueDate}T00:00:00`) : dueDate;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function fireConfetti() {
  confetti({
    particleCount: 80,
    spread: 60,
    origin: { y: 0.7 },
    colors: ["#22c55e", "#16a34a", "#4ade80", "#86efac"],
  });
}

export function TodoItem({
  id,
  text,
  completed,
  dueDate,
  category,
}: TodoItemProps) {
  const [isPending, startTransition] = useTransition();
  const formattedDueDate = formatDueDate(dueDate);

  function handleToggle() {
    const wasCompleted = completed;
    startTransition(async () => {
      await toggleTodo(id);
      if (!wasCompleted) fireConfetti();
    });
  }

  function handleDelete() {
    startTransition(() => deleteTodo(id));
  }

  return (
    <li
      className={`group flex items-start gap-2.5 px-3 py-2.5 transition-opacity sm:items-center sm:gap-3 sm:px-4 sm:py-3 ${
        isPending ? "opacity-50" : ""
      }`}
    >
      <button
        onClick={handleToggle}
        disabled={isPending}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          completed
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-zinc-300 hover:border-emerald-400 dark:border-zinc-600 dark:hover:border-emerald-500"
        }`}
      >
        {completed && (
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <span
          className={`block break-words text-sm transition-colors ${
            completed
              ? "text-zinc-400 line-through dark:text-zinc-500"
              : "text-zinc-900 dark:text-zinc-100"
          }`}
        >
          {text}
        </span>
        {(formattedDueDate || category) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            {category && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset"
                style={{
                  backgroundColor: `${category.color}1f`,
                  color: category.color,
                  // @ts-expect-error -- CSS custom property for Tailwind's ring color
                  "--tw-ring-color": `${category.color}40`,
                }}
              >
                {category.name}
              </span>
            )}
            {formattedDueDate && <span>Due {formattedDueDate}</span>}
          </div>
        )}
      </div>

      <button
        onClick={handleDelete}
        disabled={isPending}
        className="shrink-0 p-1 text-zinc-400 transition-all hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 dark:text-zinc-500 dark:hover:text-red-400"
        aria-label={`Delete "${text}"`}
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </li>
  );
}
