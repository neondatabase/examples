import type { ReactNode } from "react";

import { cn } from "./cn";

// A quiet fact pill for enriched facts. Deliberately colourless so the green
// stays reserved for live and agent activity.
export function Chip({
  icon,
  title,
  className,
  children,
}: {
  icon?: ReactNode;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-surface-2 px-2 text-xs text-fg-muted",
        className,
      )}
    >
      {icon ? <span className="inline-flex shrink-0 items-center text-fg-subtle">{icon}</span> : null}
      {children}
    </span>
  );
}
