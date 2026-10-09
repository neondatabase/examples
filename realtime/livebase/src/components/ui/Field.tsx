import type { ReactNode } from "react";
import { cn } from "./cn";

// A label-over-value pair for detail grids. The label is a plain span rather
// than a `<label>`, because values are often click-to-edit widgets whose own
// inputs carry their accessible names.
export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-[11px] font-medium text-fg-subtle">{label}</span>
      <div className="min-w-0 text-[13px] text-fg">{children}</div>
    </div>
  );
}
