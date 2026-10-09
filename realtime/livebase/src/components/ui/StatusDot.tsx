import type { Tone } from "~/lib/types";

import { cn } from "./cn";
import { toneDotClass } from "./tone";

// `.pulse-dot` (styles.css) adds a soft halo in the dot's own colour, for live
// and running indicators.
export function StatusDot({ tone, pulse = false, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-1.5 shrink-0 rounded-full", toneDotClass[tone], pulse && "pulse-dot", className)}
    />
  );
}
