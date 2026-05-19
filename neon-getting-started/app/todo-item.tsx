"use client";

import { useTransition } from "react";
import confetti from "canvas-confetti";
import { toggleTodo, deleteTodo } from "./actions";
import type { Todo } from "@/db/schema";

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
}: Todo) {
  const [isPending, startTransition] = useTransition();

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
      className={`group flex items-center gap-3 px-4 py-3 transition-opacity ${
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

      <span
        className={`flex-1 text-sm transition-colors ${
          completed
            ? "text-zinc-400 line-through dark:text-zinc-500"
            : "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {text}
      </span>

      <button
        onClick={handleDelete}
        disabled={isPending}
        className="text-zinc-300 opacity-0 transition-all hover:text-red-500 group-hover:opacity-100 dark:text-zinc-600 dark:hover:text-red-400"
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