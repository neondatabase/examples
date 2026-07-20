"use client";

import { useEffect, useRef, useState } from "react";
import type { Category } from "@/db/schema";

type CategoryPickerProps = {
  categories: Category[];
};

export function CategoryPicker({ categories }: CategoryPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const selected = categories.find((category) => category.id === selectedId);

  // If categories couldn't be loaded (e.g. table was dropped), render nothing
  // so the rest of the form keeps working.
  if (categories.length === 0) return null;

  return (
    <div ref={containerRef} className="relative min-w-0">
      <input type="hidden" name="categoryId" value={selectedId} readOnly />
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-left text-sm text-zinc-900 outline-none transition-colors hover:border-zinc-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600 dark:focus:border-emerald-500"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="flex items-center gap-2">
          {selected ? (
            <>
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: selected.color }}
              />
              {selected.name}
            </>
          ) : (
            <span className="text-zinc-400 dark:text-zinc-500">Category</span>
          )}
        </span>
        <svg
          className="h-4 w-4 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <ul
          className="absolute right-0 z-10 mt-2 w-full min-w-[11rem] overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-lg sm:left-0 sm:right-auto sm:w-44 dark:border-zinc-800 dark:bg-zinc-900"
          role="listbox"
        >
          <li>
            <button
              type="button"
              onClick={() => {
                setSelectedId("");
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              role="option"
              aria-selected={selectedId === ""}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full border border-zinc-300 dark:border-zinc-600"
              />
              None
            </button>
          </li>
          {categories.map((category) => (
            <li key={category.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(category.id);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                  selectedId === category.id
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-700 dark:text-zinc-200"
                }`}
                role="option"
                aria-selected={selectedId === category.id}
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                {category.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
