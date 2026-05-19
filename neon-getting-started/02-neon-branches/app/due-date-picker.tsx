"use client";

import { useMemo, useState } from "react";

const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function toDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function fromDateValue(value: string) {
  return new Date(`${value}T00:00:00`);
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(fromDateValue(value));
}

export function DueDatePicker() {
  const today = useMemo(() => new Date(), []);
  const todayValue = toDateValue(today);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );

  const days = useMemo(() => {
    const firstDay = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1,
    );
    const daysInMonth = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + 1,
      0,
    ).getDate();

    return {
      leadingBlanks: Array.from({ length: firstDay.getDay() }),
      dates: Array.from({ length: daysInMonth }, (_, index) => {
        const date = new Date(
          visibleMonth.getFullYear(),
          visibleMonth.getMonth(),
          index + 1,
        );

        return {
          date,
          value: toDateValue(date),
        };
      }),
    };
  }, [visibleMonth]);

  function changeMonth(offset: number) {
    setVisibleMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  }

  function selectDate(value: string) {
    setSelectedDate(value);
    setIsOpen(false);
  }

  return (
    <div className="relative">
      <input type="hidden" name="dueDate" value={selectedDate} readOnly />
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-900 outline-none transition-colors hover:border-zinc-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600 dark:focus:border-emerald-500 sm:w-44"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <span className={selectedDate ? "" : "text-zinc-400 dark:text-zinc-500"}>
          {selectedDate ? formatDate(selectedDate) : "Due date"}
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
            d="M8 7V3m8 4V3M5 11h14M6 5h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute left-0 z-10 mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          role="dialog"
          aria-label="Choose due date"
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              aria-label="Previous month"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {formatMonth(visibleMonth)}
            </p>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              aria-label="Next month"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-zinc-400">
            {weekdays.map((weekday) => (
              <div key={weekday}>{weekday}</div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {days.leadingBlanks.map((_, index) => (
              <div key={`blank-${index}`} />
            ))}
            {days.dates.map(({ date, value }) => {
              const isSelected = value === selectedDate;
              const isToday = value === todayValue;

              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => selectDate(value)}
                  className={`rounded-md py-1.5 text-sm transition-colors ${
                    isSelected
                      ? "bg-emerald-500 text-white hover:bg-emerald-600"
                      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  } ${isToday && !isSelected ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""}`}
                  aria-label={`Choose ${formatDate(value)}`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => {
                setSelectedDate("");
                setIsOpen(false);
              }}
              className="text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => selectDate(todayValue)}
              className="text-xs font-medium text-emerald-600 transition-colors hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
