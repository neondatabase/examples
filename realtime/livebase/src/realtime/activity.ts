import { eq, inArray, useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef, useState } from "react";

import { PROCESSING_STATUSES } from "~/lib/constants";
import type { Run, RunStep } from "~/lib/types";
import { useLead } from "~/realtime/hooks";
import { useRealtime } from "~/realtime/RealtimeProvider";
import { useLeadMessages } from "~/realtime/messages";
import { attachToolDetails, buildRuns, currentActivity, groupSpansByLead } from "~/realtime/runs";

// Agent activity comes straight from Mastra's synced span rows. Runs are
// rebuilt whenever a span changes, so a step shows up as soon as its row syncs.

const NO_RUNS: readonly Run[] = [];

// Re-renders every `intervalMs` for live durations. Zero pauses the clock.
// The server and the first client render each read their own clock, so a
// status right at the running/interrupted grace boundary can differ across
// hydration; that is rare enough to accept.
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (intervalMs <= 0) return;
    setNow(new Date()); // catch up after a pause
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

// Running runs first, then newest first.
export function useLeadActivity(
  leadId: string,
  options: { withMessages: boolean },
): { runs: readonly Run[]; isReady: boolean } {
  const { withMessages } = options;
  const { descriptors, seeded } = useRealtime();
  const { row, isReady: leadReady } = useLead(leadId);
  // Mastra copies a run's threadId, which is the lead's ID, onto every span
  // of the run, so this selects all of the lead's runs.
  const { data: spans, isReady: spansReady } = useLiveQuery({
    query: (q) => q.from({ span: descriptors.spans }).where(({ span }) => eq(span.threadId, leadId)),
  });
  const { messages } = useLeadMessages(leadId, withMessages);

  // A run that hasn't ended turns from running to interrupted with time, so
  // the clock ticks, but only while something is running.
  const [ticking, setTicking] = useState(false);
  const now = useNow(ticking ? 1000 : 0);
  const lead = row?.lead;

  const runs = useMemo(() => {
    if (!lead) return NO_RUNS;
    const built = buildRuns(spans, lead, now);
    return (withMessages ? attachToolDetails(built, messages, spans) : built).sort(compareRuns);
  }, [lead, messages, now, spans, withMessages]);

  const hasRunning = runs.some((run) => run.status === "running");
  useEffect(() => {
    setTicking(hasRunning);
  }, [hasRunning]);

  // Like `useLead`, the SSR seed counts as ready, so a lead with no runs
  // renders its placeholder on the server rather than a skeleton.
  return { runs, isReady: leadReady && (spansReady || seeded) };
}

// What each processing lead's agent is doing now, for the status badges in
// the list and the lead header. Workspace-wide, so the list needs one hook
// rather than one per row. It reads no messages (one query per lead would be
// too many), so a tool step is named by what its tool does ("Searching the
// web"), without its input.
export function useRunningStepByLead(): ReadonlyMap<string, RunStep> {
  const { descriptors } = useRealtime();
  const { data: leads } = useLiveQuery({
    query: (q) =>
      q.from({ lead: descriptors.leads }).where(({ lead }) => inArray(lead.status, [...PROCESSING_STATUSES])),
  });
  const { data: spans } = useLiveQuery({ query: (q) => q.from({ span: descriptors.spans }) });
  // The rows are memoised, so a step that hasn't changed keeps the object it
  // had last time instead of re-rendering its row on every span write.
  const previous = useRef<ReadonlyMap<string, RunStep>>(new Map());

  return useMemo(() => {
    const steps = new Map<string, RunStep>();
    const spansByLead = groupSpansByLead(spans);
    // A processing lead's newest unended run counts as running at any time,
    // and that is the run picked here, so the exact clock doesn't matter.
    const now = new Date();
    for (const lead of leads) {
      const [latest] = buildRuns(spansByLead.get(lead.id) ?? [], lead, now)
        .filter((run) => run.status === "running")
        .sort(compareRuns);
      const step = latest ? currentActivity(latest) : undefined;
      if (!step) continue;
      const prior = previous.current.get(lead.id);
      steps.set(lead.id, prior && sameStep(prior, step) ? prior : step);
    }
    // Safe during render: if React discards this render, the next one only
    // reuses steps that are equal anyway.
    previous.current = steps;
    return steps;
  }, [leads, spans]);
}

function compareRuns(a: Run, b: Run): number {
  const running = Number(b.status === "running") - Number(a.status === "running");
  return running !== 0 ? running : startTime(b) - startTime(a);
}

function startTime(run: Run): number {
  return run.startedAt?.getTime() ?? 0;
}

function sameStep(a: RunStep, b: RunStep): boolean {
  return (Object.keys(a) as (keyof RunStep)[]).every((key) => {
    const x = a[key];
    const y = b[key];
    return x instanceof Date && y instanceof Date ? x.getTime() === y.getTime() : x === y;
  });
}
