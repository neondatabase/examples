import { useId, useState } from "react";

import { Skeleton, Spinner, StatusDot, ZapIcon, cn } from "~/components/ui";
import type { Run } from "~/lib/types";
import { useLeadActivity } from "~/realtime/activity";
import { useLead } from "~/realtime/hooks";

import { RunCard } from "./RunCard";

const WORKING = "An agent is working on this lead";

export interface AgentActivityProps {
  readonly leadId: string;
  readonly variant: "inline" | "page";
}

export function AgentActivity({ leadId, variant }: AgentActivityProps) {
  // This component only mounts while the activity is on screen, so the
  // per-lead messages collection (tool inputs and results) opens exactly
  // then.
  const { runs, isReady } = useLeadActivity(leadId, { withMessages: true });
  const { row } = useLead(leadId);
  // A user's explicit toggle beats the default, so a run they opened stays
  // open after it finishes.
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const headingId = useId();

  const page = variant === "page";
  const latestTraceId = page ? newestRun(runs)?.traceId : undefined;
  const anyRunning = runs.some((run) => run.status === "running");
  // A new lead's extraction root span can land a moment after the lead itself.
  const awaitingRun = row?.lead.status === "extracting";
  const Heading = page ? "h2" : "h3";

  // Running runs are open; finished runs fold into history. The page has room
  // to keep the latest run open too.
  function isExpanded(run: Run): boolean {
    return toggled.get(run.traceId) ?? (run.status === "running" || run.traceId === latestTraceId);
  }

  function toggle(run: Run) {
    const next = !isExpanded(run);
    setToggled((previous) => new Map(previous).set(run.traceId, next));
  }

  return (
    <section aria-labelledby={headingId} className={cn("flex flex-col", page ? "gap-3" : "gap-2")}>
      <header className="flex items-center gap-2">
        <Heading id={headingId} className={cn("font-medium text-fg", page ? "text-sm" : "text-[13px]")}>
          Agent activity
        </Heading>
        {runs.length > 0 && (
          <span className="rounded-full bg-surface-3 px-1.5 text-[11px] leading-4 tabular-nums text-fg-muted">
            {runs.length}
            <span className="sr-only">{runs.length === 1 ? " run" : " runs"}</span>
          </span>
        )}
        {/* Always mounted, so screen readers announce when an agent starts. */}
        <span role="status" title={anyRunning ? WORKING : undefined} className="flex">
          {anyRunning && (
            <>
              <StatusDot tone="green" pulse />
              <span className="sr-only">{WORKING}</span>
            </>
          )}
        </span>
        {page && (
          <span
            title="Mastra's own trace table, synced live through Neon Realtime"
            className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] text-fg-subtle"
          >
            <ZapIcon size={11} />
            mastra_ai_spans
          </span>
        )}
      </header>

      {runs.length > 0 ? (
        <ol className={cn("flex flex-col", page ? "gap-2.5" : "gap-2")}>
          {runs.map((run) => (
            <li key={run.traceId} className="animate-enter">
              <RunCard
                run={run}
                expanded={isExpanded(run)}
                onToggle={() => toggle(run)}
                variant={variant}
              />
            </li>
          ))}
        </ol>
      ) : !isReady ? (
        <Skeleton className={cn("rounded-lg", page ? "h-12" : "h-10")} />
      ) : (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border border-dashed border-line text-fg-subtle",
            page ? "justify-center px-4 py-8 text-[13px]" : "px-3 py-3 text-xs",
          )}
        >
          {awaitingRun && <Spinner size="xs" className="text-accent" />}
          No agent runs yet
        </div>
      )}
    </section>
  );
}

function newestRun(runs: readonly Run[]): Run | undefined {
  let newest: Run | undefined;
  for (const run of runs) {
    if (!newest || (run.startedAt?.getTime() ?? 0) > (newest.startedAt?.getTime() ?? 0)) newest = run;
  }
  return newest;
}
