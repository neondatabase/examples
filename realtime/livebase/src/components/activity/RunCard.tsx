import { Bot, ChevronRight, ScanText, Sparkles, type LucideIcon } from "lucide-react";

import { Spinner, cn, useHydrated } from "~/components/ui";
import { formatClockTime, formatDuration } from "~/lib/format";
import type { Run, RunKind } from "~/lib/types";
import { useNow } from "~/realtime/activity";

import { RunStatusBadge } from "./RunStatusBadge";
import { StepTimeline } from "./StepTimeline";

const KIND_ICONS: Record<RunKind, LucideIcon> = {
  extraction: ScanText,
  enrichment: Sparkles,
  other: Bot,
};

export interface RunCardProps {
  readonly run: Run;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly variant: "inline" | "page";
}

export function RunCard({ run, expanded, onToggle, variant }: RunCardProps) {
  const Icon = KIND_ICONS[run.kind];
  const running = run.status === "running";
  const inset = variant === "page" ? "px-4" : "px-3";

  return (
    <article
      className={cn(
        "overflow-hidden rounded-lg border bg-surface transition-colors",
        running ? "border-accent/30" : "border-line",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          "flex w-full items-center gap-2 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:-outline-offset-2",
          inset,
          variant === "page" ? "py-2.5" : "py-2",
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-fg-subtle transition-transform duration-150",
            expanded && "rotate-90",
          )}
        />
        <Icon aria-hidden className={cn("size-4 shrink-0", running ? "text-accent" : "text-fg-muted")} />
        <span className="min-w-0 truncate text-[13px] font-medium text-fg">{run.label}</span>
        <RunStatusBadge status={run.status} className="shrink-0" />
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] tabular-nums text-fg-subtle">
          {run.startedAt && <ClockTime date={run.startedAt} />}
          <RunDuration run={run} />
        </span>
      </button>

      {run.status === "failed" && run.errorMessage && (
        <p
          title={run.errorMessage}
          className={cn(
            "mb-2 line-clamp-2 break-words rounded-md bg-danger/10 px-2 py-1 text-xs text-danger",
            variant === "page" ? "mx-4" : "mx-3",
          )}
        >
          {run.errorMessage}
        </p>
      )}

      {expanded && (
        <div className={cn("border-t border-line", inset, variant === "page" ? "py-3" : "py-2.5")}>
          <RunSteps run={run} />
          <RunFooter run={run} />
        </div>
      )}
    </article>
  );
}

function RunSteps({ run }: { readonly run: Run }) {
  const running = run.status === "running";
  if (run.steps.length > 0) return <StepTimeline steps={run.steps} />;
  return (
    <p className="flex items-center gap-2 py-1 text-xs text-fg-subtle">
      {running && <Spinner size="xs" className="text-accent" />}
      {running ? "Waiting for the first step…" : "No steps recorded"}
    </p>
  );
}

// The trace ID ties this run, and every finding it wrote, back to Mastra's
// own trace.
function RunFooter({ run }: { readonly run: Run }) {
  const count = run.steps.length;
  return (
    <footer className="mt-2.5 flex items-center gap-3 border-t border-dashed border-line pt-2 text-[11px] text-fg-subtle">
      <span className="tabular-nums">
        {count} {count === 1 ? "step" : "steps"}
      </span>
      {run.endedAt && (
        <span className="tabular-nums">
          Ended <ClockTime date={run.endedAt} />
        </span>
      )}
      <span className="ml-auto flex min-w-0 items-center gap-1">
        Trace
        <code title={run.traceId} className="min-w-0 truncate font-mono text-fg-muted">
          {run.traceId}
        </code>
      </span>
    </footer>
  );
}

// Formatted in the viewer's time zone and locale, which the server doesn't
// know. React keeps server text on a hydration mismatch, so the time is only
// rendered once hydrated.
function ClockTime({ date }: { readonly date: Date }) {
  const hydrated = useHydrated();
  return (
    <time dateTime={date.toISOString()} title={hydrated ? date.toLocaleString() : undefined}>
      {hydrated ? formatClockTime(date) : "--:--:--"}
    </time>
  );
}

function RunDuration({ run }: { readonly run: Run }) {
  if (!run.startedAt) return null;
  if (run.status === "running") return <LiveDuration since={run.startedAt} />;
  if (!run.endedAt) return null;
  return <span>{formatDuration(Math.max(0, run.endedAt.getTime() - run.startedAt.getTime()))}</span>;
}

// A separate component so that only this span re-renders on each tick. The
// 100 ms tick matches the tenths of a second shown for the first minute. The
// clamp hides small clock skew between the server and the browser.
function LiveDuration({ since }: { readonly since: Date }) {
  const now = useNow(100);
  return (
    <span className="text-accent" suppressHydrationWarning>
      {formatDuration(Math.max(0, now.getTime() - since.getTime()))}
    </span>
  );
}
