"use client";

import { useEffect, useState } from "react";

// A fixed locale and time zone, so the server render and hydration produce the same text.
const fixedFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const localFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function LocalTime({ date }: { date: Date }) {
  const [hydrated, setHydrated] = useState(false);
  // After hydration, switch to the browser's locale and time zone (as LocalTime in the reactivity guide).
  useEffect(() => setHydrated(true), []);
  return (
    // Fixed width and tabular digits, so the row doesn't shift when the text changes.
    <time
      dateTime={date.toISOString()}
      className="inline-block w-36 shrink-0 tabular-nums"
    >
      {(hydrated ? localFormat : fixedFormat).format(date)}
    </time>
  );
}
