import { cn } from "./cn";

// A `span` with `display: block`, so a skeleton is valid inside inline
// content (a row's text cell) as well as in block layouts.
export function Skeleton({ className }: { className?: string }) {
  // Two `rounded-*` classes would conflict and stylesheet order, not class
  // order, would pick the winner (see `cn`), so only add the default radius
  // when the caller hasn't picked one.
  const hasRadius = className !== undefined && /(^|\s)rounded(-|\s|$)/.test(className);
  return (
    <span
      aria-hidden
      className={cn("shimmer block bg-surface-2", !hasRadius && "rounded-sm", className)}
    />
  );
}
