import { truncate } from "~/lib/format";
import type { LeadRef } from "~/lib/types";

// The in-process background runner. It owns each lead's cancellation
// handle, the enrichment concurrency limit, and restart on edit. It
// imports nothing from the server, so it can run with stub stages and small
// timings; `runner.server.ts` wires in the real ones.

export interface JobContext extends LeadRef {
  readonly signal: AbortSignal;
}

// The work the runner schedules. A stage throws on failure; the runner decides
// what that means.
export interface RunnerStages {
  // Resolves true when enrichment should follow.
  runExtraction(job: JobContext): Promise<boolean>;
  runEnrichment(job: JobContext): Promise<void>;
  markLeadFailed(ref: LeadRef, message: string): Promise<void>;
  // Fails the leads an earlier process left mid-job. Resolves to their count.
  failInterruptedLeads(): Promise<number>;
}

export interface RunnerOptions {
  readonly restartDebounceMs: number;
  readonly extractionTimeoutMs: number;
  readonly enrichmentTimeoutMs: number;
  readonly maxConcurrentEnrichments: number;
}

export interface RestartOptions {
  // The lead's extraction never landed, so the restart begins there.
  readonly fromExtraction?: boolean;
}

export interface Runner {
  readonly ready: Promise<void>; // resolves after interrupted leads are marked failed
  startLead(ref: LeadRef): void; // extraction, then enrichment
  restartEnrichment(ref: LeadRef, options?: RestartOptions): void; // cancel now, restart after a debounce
  // Archive and delete. Aborts at once, and resolves once the lead's jobs have
  // settled, or at once when it has none. An aborted agent call still saves its
  // last step after its in-flight tools settle, so a delete waits for this
  // before it removes the lead's thread.
  cancel(leadId: string): Promise<void>;
}

type Phase = "extracting" | "enriching";

interface Job {
  readonly controller: AbortController;
  phase: Phase;
  // The current stage's deadline. It stays separate from `controller` so that
  // a timeout can be told apart from a deliberate cancel.
  deadline?: AbortSignal;
}

interface PendingRestart {
  readonly timer: ReturnType<typeof setTimeout>;
  // Where the restarted job begins. It outlives the cancelled job, so later
  // edits in the same window still know that extraction never finished.
  readonly phase: Phase;
}

// The abort reasons a stage's signal carries. Agent code records the reason on
// the run, so the activity panel shows a cancel apart from a timeout.
function cancelReason(): DOMException {
  return new DOMException("Cancelled", "AbortError");
}

function timeoutReason(): DOMException {
  return new DOMException("Timed out", "TimeoutError");
}

// A FIFO semaphore. A released slot passes straight to the next waiter, so a
// newcomer can't overtake the queue. The slot is released in `finally`, so
// every path out of the task gives it back. A waiter whose signal aborts
// leaves the queue at once, so a lead cancelled while queued settles without
// waiting for a slot, and `cancel` resolves promptly for it.
function createSemaphore(limit: number) {
  let active = 0;
  const waiters: (() => void)[] = [];

  function waitForSlot(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const take = () => {
        signal.removeEventListener("abort", leave);
        resolve();
      };
      const leave = () => {
        waiters.splice(waiters.indexOf(take), 1);
        reject(signal.reason);
      };
      waiters.push(take);
      signal.addEventListener("abort", leave, { once: true });
    });
  }

  return async function withSlot<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    if (active < limit) active += 1;
    else await waitForSlot(signal);
    try {
      return await task();
    } finally {
      const next = waiters.shift();
      if (next) next();
      else active -= 1;
    }
  };
}

// Waits for `settled`, but for at most `ms`. Resolves true when it settled in
// time, whether it resolved or rejected.
export async function settleWithin(settled: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([settled.then(() => true, () => true), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Runs one stage with a fresh deadline, combined with the job's own cancel
// signal. The deadline is a plain timer rather than `AbortSignal.timeout()`,
// so that it's cleared when the stage settles and fake timers can drive it.
async function withDeadline<T>(
  job: Job,
  timeoutMs: number,
  stage: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const deadline = new AbortController();
  job.deadline = deadline.signal;
  const timer = setTimeout(() => deadline.abort(timeoutReason()), timeoutMs);
  try {
    return await stage(AbortSignal.any([job.controller.signal, deadline.signal]));
  } finally {
    clearTimeout(timer);
  }
}

// What the runner logs for a failed stage: the error's name and message, plus
// its HTTP status when it or its cause has one. Never the error object: a
// failed model call chains the provider's error, which carries the gateway URL
// and the whole request body, the lead's raw input included.
export function logDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const statusOf = (value: unknown) => (value as { statusCode?: unknown } | undefined)?.statusCode;
  const status = [statusOf(error), statusOf(error.cause)].find((value) => typeof value === "number");
  return `${error.name}: ${error.message}${status === undefined ? "" : ` (HTTP ${status})`}`;
}

function failureMessage(phase: Phase, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  const stage = phase === "extracting" ? "Extraction" : "Enrichment";
  return truncate(`${stage} failed: ${detail.replace(/\s+/g, " ").trim()}`, 160);
}

export function createRunner(stages: RunnerStages, options: RunnerOptions): Runner {
  const jobs = new Map<string, Job>();
  // Each lead's jobs that haven't settled yet, including cancelled ones that
  // are still winding down. `cancel` waits for them.
  const unsettled = new Map<string, Set<Promise<void>>>();
  const restartTimers = new Map<string, PendingRestart>();
  const withEnrichmentSlot = createSemaphore(options.maxConcurrentEnrichments);

  // Runner state lives in memory, so a server restart orphans any lead
  // that was mid-processing. Mark those failed before any new job runs.
  const ready = stages.failInterruptedLeads().then(
    (count) => {
      if (count > 0) console.info(`[runner] marked ${count} interrupted lead(s) failed`);
    },
    (error: unknown) => console.error("[runner] could not mark interrupted leads failed", error),
  );

  // Clears any pending restart and aborts the running job. The aborted job may
  // still be settling in the background; `run` stops it clobbering a newer one.
  function stop(leadId: string): void {
    clearTimeout(restartTimers.get(leadId)?.timer);
    restartTimers.delete(leadId);
    jobs.get(leadId)?.controller.abort(cancelReason());
    jobs.delete(leadId);
  }

  function start(ref: LeadRef, phase: Phase): void {
    stop(ref.leadId);
    const job: Job = { controller: new AbortController(), phase };
    jobs.set(ref.leadId, job);
    const settled = run(ref, job);
    const pending = unsettled.get(ref.leadId) ?? new Set();
    unsettled.set(ref.leadId, pending);
    pending.add(settled);
    void settled.then(() => {
      pending.delete(settled);
      if (pending.size === 0 && unsettled.get(ref.leadId) === pending) unsettled.delete(ref.leadId);
    });
  }

  // Runs one job and applies the error policy. It never rejects: only `cancel`
  // awaits it, to know when it has settled.
  async function run(ref: LeadRef, job: Job): Promise<void> {
    const { signal } = job.controller;
    try {
      // The startup sweep would fail this lead if it landed mid-job.
      await ready;
      signal.throwIfAborted();
      if (job.phase === "extracting") {
        // Extraction skips the semaphore so that it stays fast.
        const enrich = await withDeadline(job, options.extractionTimeoutMs, (stageSignal) =>
          stages.runExtraction({ ...ref, signal: stageSignal }),
        );
        if (!enrich || signal.aborted) return;
        job.phase = "enriching";
      }
      await withEnrichmentSlot(signal, async () => {
        // Cancelled as the slot was handed over: pass it straight on.
        signal.throwIfAborted();
        await withDeadline(job, options.enrichmentTimeoutMs, (stageSignal) =>
          stages.runEnrichment({ ...ref, signal: stageSignal }),
        );
      });
    } catch (error) {
      // An archive, delete, or edit cancelled the job on purpose.
      if (signal.aborted) return;
      const timedOut = job.deadline?.aborted === true;
      console.error(`[runner] lead ${ref.leadId} failed while ${job.phase}: ${logDetail(error)}`);
      // Only this lead fails; other jobs carry on.
      await stages.markLeadFailed(ref, timedOut ? "Timed out" : failureMessage(job.phase, error)).catch(
        (markError: unknown) => console.error(`[runner] could not mark lead ${ref.leadId} failed`, markError),
      );
    } finally {
      // A restart may already have registered a newer job for this lead.
      if (jobs.get(ref.leadId) === job) jobs.delete(ref.leadId);
    }
  }

  return {
    ready,
    startLead(ref) {
      start(ref, "extracting");
    },
    restartEnrichment(ref, restart) {
      // A job cancelled mid-extraction restarts from extraction, as does a lead
      // the caller knows was never extracted. Otherwise only enrichment reruns,
      // and it reads the edited values.
      const phase = restart?.fromExtraction
        ? "extracting"
        : jobs.get(ref.leadId)?.phase ?? restartTimers.get(ref.leadId)?.phase ?? "enriching";
      stop(ref.leadId);
      // Each edit resets the timer, so a burst of edits restarts once.
      const timer = setTimeout(() => start(ref, phase), options.restartDebounceMs);
      restartTimers.set(ref.leadId, { timer, phase });
    },
    cancel(leadId) {
      stop(leadId);
      return Promise.all(unsettled.get(leadId) ?? []).then(() => undefined);
    },
  };
}
