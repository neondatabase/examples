import type { ReactNode } from "react";

// A keyboard key cap for shortcut hints.
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line bg-surface-2 px-1 font-sans text-[11px] leading-none font-medium text-fg-subtle">
      {children}
    </kbd>
  );
}
