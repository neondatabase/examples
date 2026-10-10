import type { ReactNode } from "react";

import { cn } from "./cn";

const sizeClass = {
  sm: "h-6 gap-1.5 px-2 text-xs",
  md: "h-7 gap-1.5 px-2.5 text-[13px]",
} as const;

// A group of toggle buttons (aria-pressed). Each segment is its own tab stop,
// which avoids the roving-focus keyboard model a radiogroup would require.
// Segments wrap rather than scroll: a scrolling container would clip the
// focus ring.
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  "aria-label": ariaLabel,
}: {
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
  "aria-label": string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-md border border-line bg-surface p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex shrink-0 items-center whitespace-nowrap rounded-sm font-medium transition-colors",
              sizeClass[size],
              selected ? "bg-surface-3 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
