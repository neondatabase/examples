import { useSyncExternalStore } from "react";
import { formatRelativeTime } from "~/lib/format";
import { cn } from "./cn";
import { useHydrated } from "./useHydrated";

const TICK_MS = 15_000;

// One shared 15 s ticker for every timestamp on the page, so a long lead
// list re-renders its "4m ago" labels together instead of on scattered timers.
let tick = 0;
let interval: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (interval === undefined) {
    interval = setInterval(() => {
      tick++;
      for (const notify of listeners) notify();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(interval);
      interval = undefined;
    }
  };
}

const getTick = () => tick;

const FULL_TIMESTAMP = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" });

function isValidDate(date: Date | null | undefined): date is Date {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

export function RelativeTime({ date, className }: { date: Date | null | undefined; className?: string }) {
  // Subscribing is what re-renders us; the label itself reads the clock.
  useSyncExternalStore(subscribe, getTick, getTick);
  const hydrated = useHydrated();
  const valid = isValidDate(date);
  return (
    // The server's clock can differ from the browser's, so the first client
    // label may not match the HTML; React keeps the server's text until the
    // label next changes. The full timestamp depends on the locale and time
    // zone and never changes, so React would never patch it: it waits for
    // hydration instead.
    <time
      suppressHydrationWarning
      dateTime={valid ? date.toISOString() : undefined}
      title={valid && hydrated ? FULL_TIMESTAMP.format(date) : undefined}
      className={cn("whitespace-nowrap", className)}
    >
      {formatRelativeTime(date)}
    </time>
  );
}
