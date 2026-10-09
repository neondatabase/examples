import type { CSSProperties } from "react";
import { initials } from "~/lib/format";
import { cn } from "./cn";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

// Box, type and corner sizes per step. Shared with `CompanyLogo` and `Avatar`
// so an image and its monogram fallback occupy exactly the same box.
export const avatarBox: Record<AvatarSize, string> = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
  xl: "size-14 text-lg",
};

export const squareRadius: Record<AvatarSize, string> = {
  xs: "rounded",
  sm: "rounded",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
};

// A stable hue per name (FNV-1a), so different companies and people look
// distinct before any logo arrives.
function hueOf(name: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 360;
}

function toneStyle(name: string | null | undefined): CSSProperties | undefined {
  const key = name?.trim().toLowerCase();
  if (!key) return undefined;
  const hue = hueOf(key);
  // Muted, dark background with a light text of the same hue: colourful
  // enough to tell apart, quiet enough to sit on the dark surfaces.
  return {
    backgroundColor: `hsl(${hue} 25% 22%)`,
    color: `hsl(${hue} 55% 82%)`,
  };
}

export function Monogram({
  name,
  size = "md",
  shape = "circle",
  className,
}: {
  name: string | null | undefined;
  size?: AvatarSize;
  shape?: "circle" | "square";
  className?: string;
}) {
  const style = toneStyle(name);
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden leading-none font-semibold tracking-tight select-none",
        avatarBox[size],
        shape === "circle" ? "rounded-full" : squareRadius[size],
        // Unknown names get the neutral surface instead of a hue.
        !style && "bg-surface-3 text-fg-muted",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
