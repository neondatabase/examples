import type { Tone } from "~/lib/types";

// Tone → colour token: green→accent, yellow→warn, red→danger, orange→orange,
// blue→info, purple→violet, neutral→fg-muted. Every class is written out in
// full so Tailwind's source scanner can find it; never build these by string
// concatenation.

// Tinted pill: the tone colour at ~12 % background, 30 % border, full text.
export const toneBadgeClass: Record<Tone, string> = {
  neutral: "bg-fg-muted/12 border-fg-muted/30 text-fg-muted",
  green: "bg-accent/12 border-accent/30 text-accent",
  blue: "bg-info/12 border-info/30 text-info",
  yellow: "bg-warn/12 border-warn/30 text-warn",
  orange: "bg-orange/12 border-orange/30 text-orange",
  red: "bg-danger/12 border-danger/30 text-danger",
  purple: "bg-violet/12 border-violet/30 text-violet",
};

// Solid fill, for status dots.
export const toneDotClass: Record<Tone, string> = {
  neutral: "bg-fg-muted",
  green: "bg-accent",
  blue: "bg-info",
  yellow: "bg-warn",
  orange: "bg-orange",
  red: "bg-danger",
  purple: "bg-violet",
};

// Text colour only.
export const toneTextClass: Record<Tone, string> = {
  neutral: "text-fg-muted",
  green: "text-accent",
  blue: "text-info",
  yellow: "text-warn",
  orange: "text-orange",
  red: "text-danger",
  purple: "text-violet",
};
