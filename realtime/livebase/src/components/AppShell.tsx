import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ConnectionIndicator } from "~/components/ConnectionIndicator";
import { WriteErrorToast } from "~/components/WriteErrorToast";
import { ZapIcon, cn } from "~/components/ui";
import { useRealtime } from "~/realtime/RealtimeProvider";

// The top bar shares the main column's width and padding, so the logo lines up
// with the page content below it.
const COLUMN = "mx-auto w-full max-w-[1200px] px-4 sm:px-6";

export function AppShell({ children }: { readonly children: ReactNode }) {
  const { workspaceName } = useRealtime();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 h-12 shrink-0 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className={cn(COLUMN, "flex h-full items-center gap-3")}>
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 rounded-md text-fg transition-opacity hover:opacity-80"
          >
            <ZapIcon size={18} className="text-accent" />
            <span className="text-[15px] leading-none font-semibold tracking-tight">Livebase</span>
          </Link>
          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-line-strong" />
          <span className="min-w-0 truncate text-[13px] text-fg-muted">{workspaceName}</span>
          <div className="ml-auto flex shrink-0 items-center gap-4">
            <span className="hidden text-xs text-fg-subtle md:inline">
              Neon Realtime · TanStack DB · Mastra
            </span>
            <ConnectionIndicator />
          </div>
        </div>
      </header>
      <main className={cn(COLUMN, "flex-1 py-6 sm:py-8")}>{children}</main>
      <WriteErrorToast />
    </div>
  );
}
