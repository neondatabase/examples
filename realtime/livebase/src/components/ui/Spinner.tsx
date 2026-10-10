import { LoaderCircle } from "lucide-react";

import type { Size } from "./Button";
import { cn } from "./cn";

const sizeClass: Record<Size, string> = {
  xs: "size-3",
  sm: "size-3.5",
  md: "size-4",
};

// Draws in currentColor, so it takes the colour of the badge or button it sits
// in; pass a text class to override. Decorative (lucide adds `aria-hidden`):
// callers put the status in text. Under reduced motion the still circle keeps
// the meaning.
export function Spinner({ size = "sm", className }: { size?: Size; className?: string }) {
  return <LoaderCircle className={cn("shrink-0 animate-spin motion-reduce:animate-none", sizeClass[size], className)} />;
}
