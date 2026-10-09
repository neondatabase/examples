import type { ReactNode } from "react";
import { cn } from "./cn";

// A quiet card for the detail page sections. The header row only renders
// when there's a title or actions, so a bare panel is just a padded box.
export function Panel({
  title,
  actions,
  className,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const hasHeader = title != null || actions != null;
  return (
    <section className={cn("rounded-lg border border-line bg-surface", className)}>
      {hasHeader && (
        <header className="flex min-h-10 items-center justify-between gap-3 border-b border-line px-4 py-2">
          {title != null && (
            <h2 className="min-w-0 truncate text-[13px] font-medium text-fg">{title}</h2>
          )}
          {actions != null && (
            <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
