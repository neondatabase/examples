import type { ReactNode } from "react";

import type { Tone } from "~/lib/types";

import { cn } from "./cn";
import { toneBadgeClass } from "./tone";

// A tinted status pill. The icon slot inherits the tone through currentColor.
export function Badge({
  tone = "neutral",
  icon,
  title,
  className,
  children,
}: {
  tone?: Tone;
  icon?: ReactNode;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 min-w-0 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[11px] leading-none font-medium",
        toneBadgeClass[tone],
        className,
      )}
    >
      {icon ? <span className="inline-flex shrink-0 items-center">{icon}</span> : null}
      {children}
    </span>
  );
}
