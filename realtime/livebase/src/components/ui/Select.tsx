import { ChevronDown } from "lucide-react";

import type { Tone } from "~/lib/types";

import type { Size } from "./Button";
import { cn } from "./cn";
import { toneBadgeClass, toneTextClass } from "./tone";

const sizeClass: Record<Size, string> = {
  xs: "h-6 pl-2 pr-6 text-xs",
  sm: "h-7 pl-2.5 pr-7 text-[13px]",
  md: "h-8 pl-3 pr-8 text-[13px]",
};

const chevronClass: Record<Size, string> = {
  xs: "right-1.5 size-3",
  sm: "right-2 size-3.5",
  md: "right-2.5 size-3.5",
};

// A native <select> keeps keyboard, screen reader, and mobile behaviour for
// free; only the closed control is restyled (styles.css colours the popup's
// options). A tone tints it like a Badge.
export function Select<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  tone,
  "aria-label": ariaLabel,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  size?: Size;
  tone?: Tone;
  "aria-label": string;
}) {
  return (
    <span className="relative inline-flex max-w-full">
      <select
        aria-label={ariaLabel}
        value={value}
        // The options come from `options`, so the browser can only report one of their values.
        onChange={(event) => onChange(event.target.value as T)}
        className={cn(
          "w-full min-w-0 cursor-pointer appearance-none truncate rounded-md border font-medium transition-colors",
          tone ? cn(toneBadgeClass[tone], "hover:brightness-125") : "border-line bg-surface-2 text-fg hover:border-line-strong",
          sizeClass[size],
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 opacity-80",
          tone ? toneTextClass[tone] : "text-fg-subtle",
          chevronClass[size],
        )}
      />
    </span>
  );
}
