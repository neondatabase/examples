import type { MastraSpan } from "~/db/mastra-schema";
import type { SyncedSpan } from "~/lib/types";
import type { Lead, LeadStatus } from "~/db/schema";
import { AGENT_IDS, PROCESSING_STATUSES } from "~/lib/constants";
import { summarizeValue } from "~/lib/format";
import type { Run, RunKind, RunStatus, RunStep, StepKind, StepStatus } from "~/lib/types";
import type { ParsedMessage, ToolInvocation } from "~/realtime/message-content";
import { toolActivityLabel, toolErrorText, toolStepLabel } from "~/realtime/tool-labels";

// Turns Mastra's own trace spans into runs and timeline steps. These are pure
// functions over synced rows: the hooks in activity.ts call them again whenever
// a span changes.

// Span types that appear in the timeline. The rest (model_generation,
// model_inference, processor_run, and so on) only show when they fail.
// Mastra nests agent_run → model_generation → model_step → tool_call, with
// one model_step per model API call, so model_step is the "Model call" step.
const VISIBLE_SPAN_TYPES: ReadonlySet<string> = new Set([
  "agent_run",
  "model_step",
  "tool_call",
  "mcp_tool_call",
  "workflow_run",
  "workflow_step",
]);

const PROCESSING: ReadonlySet<LeadStatus> = new Set(PROCESSING_STATUSES);

// Span updates are flushed in batches, so a root span can record its end a
// moment after the lead moves on. Give it time to catch up. This compares
// server timestamps with the browser's clock, so it assumes the two roughly
// agree, as they do when the whole stack runs on one machine.
const RECENT_CHANGE_MS = 10_000;

// A run that stops early ends every span still open along with its root: an
// abort in the same moment, a model error a few milliseconds before. So a
// step of a cancelled or failed run that ended this close to the root was in
// flight.
const ENDED_WITH_ROOT_MS = 100;

// A run's first message can be saved just before its root span starts.
const MESSAGE_WINDOW_LEAD_MS = 1_000;

type LeadState = Pick<Lead, "status" | "updatedAt">;


interface Trace {
  readonly root: MastraSpan;
  readonly spans: readonly MastraSpan[];
  readonly status: RunStatus;
}

// `spans` may be the whole workspace's: a run belongs to the lead whose ID is
// its threadId, which Mastra copies onto every span of the run.
export function buildRuns(
  spans: readonly MastraSpan[],
  lead: Pick<Lead, "id" | "status" | "updatedAt">,
  now: Date,
): Run[] {
  const traces: Trace[] = [];
  const leadSpans = spans.filter((span) => span.threadId === lead.id);
  for (const traceSpans of groupBy(leadSpans, (span) => span.traceId).values()) {
    // Without a root there is nothing to name the run by yet; it appears
    // once the root span syncs.
    const root = findRoot(traceSpans);
    if (root) traces.push({ root, spans: traceSpans, status: runStatus(root, lead, now) });
  }

  // A lead runs one agent at a time, so only its newest open run can still be
  // going. An older one that never ended was cut off by a server restart,
  // unless its end is still syncing, so it gets the same grace.
  const newestStart = traces.reduce(
    (latest, trace) => (trace.status === "running" ? Math.max(latest, time(trace.root.startedAt)) : latest),
    Number.NEGATIVE_INFINITY,
  );
  return traces.map(({ root, spans: traceSpans, status }) => {
    const superseded =
      status === "running" &&
      time(root.startedAt) < newestStart &&
      now.getTime() - newestStart > RECENT_CHANGE_MS;
    return toRun(root, traceSpans, superseded ? "interrupted" : status);
  });
}

// For callers that build runs for many leads: one pass over the spans rather
// than one per lead.
export function groupSpansByLead(spans: readonly MastraSpan[]): Map<string, MastraSpan[]> {
  return groupBy(spans, (span) => span.threadId);
}

// A run's status comes from its root span. Mastra ends an aborted root
// without an error, so the runner records one: an AbortError for a cancel,
// and a TimeoutError for its time limit, which is a failure.
export function runStatus(root: MastraSpan, lead: LeadState, now: Date): RunStatus {
  if (hasError(root)) return isAbortError(root.error) ? "cancelled" : "failed";
  if (root.endedAt) return "completed";
  // A root that never ended on a lead that stopped processing was cut off by
  // a server restart.
  const recentlyChanged = now.getTime() - lead.updatedAt.getTime() < RECENT_CHANGE_MS;
  return PROCESSING.has(lead.status) || recentlyChanged ? "running" : "interrupted";
}

// Spans don't carry tool arguments or results, but the lead's messages do.
// Match each run's tool steps to the tool invocations saved while the run was
// active, and label each step from its call's input. `spans` are the rows the
// runs were built from: a tool span's `toolCallId` picks its own invocation
// exactly. Mastra runs a step's tool calls in parallel, so same-tool
// spans often start in the same millisecond, and start order alone could swap
// their labels, results and errors. A span without an ID takes, in order, the
// first unclaimed call of the same tool that no other span names. A restart
// starts the next run right after the cancel, so neighbouring windows
// overlap: going oldest first, each invocation goes to the first run that
// matches it.
export function attachToolDetails(
  runs: readonly Run[],
  messages: readonly ParsedMessage[],
  spans: readonly SyncedSpan[] = [],
): Run[] {
  const oldestFirst = [...runs].sort((a, b) => time(a.startedAt) - time(b.startedAt));
  const callIds = toolCallIdsByStep(spans);
  const namedCalls = new Set(callIds.values());
  const claimed = new Set<string>();
  const detailed = new Map<Run, Run>();

  oldestFirst.forEach((run, position) => {
    // A run that never ended can't have saved anything after the next began.
    const endedAt = run.endedAt ?? oldestFirst[position + 1]?.startedAt ?? null;
    const invocations = toolInvocationsDuring(run.startedAt, endedAt, messages);
    if (invocations.length === 0) return;

    const steps = run.steps.map((step) => {
      if (step.kind !== "tool") return step;
      const callId = callIds.get(step.id);
      const match = invocations.find(
        ([key, invocation]) =>
          !claimed.has(key) &&
          (callId !== undefined
            ? key === callId
            : !namedCalls.has(key) && toolNamesMatch(step.label, invocation.toolName)),
      );
      if (!match) return step;
      const [key, invocation] = match;
      claimed.add(key);
      return withToolDetails(step, invocation, run.status !== "running");
    });
    detailed.set(run, { ...run, steps });
  });

  return runs.map((run) => detailed.get(run) ?? run);
}

// A tool step with its call's arguments and result, labelled from its input
// ("Searching the web for Dane Knecht"). A call can fail two ways:
// - it threw, so Mastra saved an error instead of a result (a record tool's
//   database error). The step failed, even if its span hasn't synced its
//   error or its end yet. A step a cancel, or the run's own stop, cut
//   off stays stopped.
// - it returned an expected failure for the model to read (a research tool's
//   `{ ok: false, error }`, or Mastra's input validation error). The step
//   completed, and keeps the error so the timeline can show it.
// A call can also never finish: Mastra leaves a call the run's abort cut off
// in `call`, with no result or error. Once the run has ended, a
// step whose span still reads as running is that call, or one whose span end
// will never sync, so it shows as stopped. Only a completed run can
// leave one: stepStatus already stops a cancelled run's open steps and fails
// a failed run's. A span that ended is trusted, because a parallel call can
// finish just before an abort stops its result being saved.
function withToolDetails(step: RunStep, invocation: ToolInvocation, runEnded: boolean): RunStep {
  const thrown = invocation.error;
  const reported = thrown === null ? reportedError(invocation.result) : null;
  const status =
    thrown !== null && step.status !== "stopped"
      ? "failed"
      : runEnded && step.status === "running" && isUnfinished(invocation)
        ? "stopped"
        : step.status;
  const succeeded = status === "completed" && reported === null;
  return {
    ...step,
    label: toolStepLabel(invocation.toolName, invocation.args, succeeded) ?? step.label,
    status,
    errorMessage: step.errorMessage ?? thrown ?? reported,
    toolName: invocation.toolName,
    // A tool without inputs (lookupGravatar's email is bound) has no
    // input line, rather than "→ {}".
    inputSummary:
      invocation.args === undefined || isEmptyObject(invocation.args) ? null : summarizeValue(invocation.args),
    // The error stands in for the result, rather than repeating it as JSON.
    resultSummary:
      thrown !== null || reported !== null || invocation.result === undefined
        ? null
        : summarizeValue(invocation.result),
  };
}

function isEmptyObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
}

// A call that has neither a result nor an error yet. "partial-call" is the AI
// SDK's state while the model is still streaming the arguments.
function isUnfinished(invocation: ToolInvocation): boolean {
  return (
    (invocation.state === "call" || invocation.state === "partial-call") &&
    invocation.result === undefined &&
    invocation.error === null
  );
}

// A result that says the call didn't work: `{ ok: false, error }` from the
// research tools, `{ ok: false, reason, message }` from persistence,
// or `{ error: true, message }` when Mastra rejects the model's input.
// The stored result is the transcript summary, which keeps these
// fields.
function reportedError(result: unknown): string | null {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  if (record.ok !== false && record.error !== true) return null;
  for (const field of ["error", "message", "reason"]) {
    const value = record[field];
    if (typeof value === "string" && value.trim() !== "") return toolErrorText(value.trim());
  }
  return "The tool reported a failure";
}

// The latest step that is still running, for "what is the agent doing now".
export function currentStep(run: Run): RunStep | undefined {
  return run.steps.findLast((step) => step.status === "running");
}

// The running step for a lead's status badge in the list and the lead header.
// They build runs from spans alone, without the lead's messages, so a tool
// step's label is the tool's name: this swaps it for what the tool does
// ("Searching the web"). A tool it has no words for keeps its name.
export function currentActivity(run: Run): RunStep | undefined {
  const step = currentStep(run);
  if (step?.kind !== "tool") return step;
  const label = toolActivityLabel(spanToolName(step.label));
  return label === null ? step : { ...step, label };
}

function groupBy(
  spans: readonly MastraSpan[],
  keyOf: (span: MastraSpan) => string | null,
): Map<string, MastraSpan[]> {
  const groups = new Map<string, MastraSpan[]>();
  for (const span of spans) {
    const key = keyOf(span);
    if (key === null) continue;
    const group = groups.get(key);
    if (group) group.push(span);
    else groups.set(key, [span]);
  }
  return groups;
}

function findRoot(spans: readonly MastraSpan[]): MastraSpan | undefined {
  const parentless = spans.filter((span) => !span.parentSpanId);
  const candidates = parentless.length > 0 ? parentless : spans.filter((span) => span.spanType === "agent_run");
  return candidates.reduce<MastraSpan | undefined>(
    (earliest, span) => (!earliest || time(span.startedAt) < time(earliest.startedAt) ? span : earliest),
    undefined,
  );
}

function toRun(root: MastraSpan, spans: readonly MastraSpan[], status: RunStatus): Run {
  return {
    traceId: root.traceId,
    ...runIdentity(root),
    status,
    startedAt: root.startedAt,
    endedAt: root.endedAt,
    errorMessage: errorMessage(root.error),
    steps: buildSteps(root, spans, status),
  };
}

function runIdentity(root: MastraSpan): { kind: RunKind; label: string } {
  const entities = [root.entityId, root.entityName];
  if (entities.includes(AGENT_IDS.extraction)) return { kind: "extraction", label: "Extraction" };
  if (entities.includes(AGENT_IDS.enrichment)) return { kind: "enrichment", label: "Enrichment" };
  return { kind: "other", label: root.entityName || root.entityId || root.name };
}

function buildSteps(root: MastraSpan, spans: readonly MastraSpan[], status: RunStatus): RunStep[] {
  // Span rows sync in any order, so a span whose parent hasn't arrived yet
  // hangs off the root for now instead of disappearing.
  const spanIds = new Set(spans.map((span) => span.spanId));
  const children = new Map<string, MastraSpan[]>();
  for (const span of spans) {
    if (span.spanId === root.spanId) continue;
    const parentId = span.parentSpanId && spanIds.has(span.parentSpanId) ? span.parentSpanId : root.spanId;
    const siblings = children.get(parentId);
    if (siblings) siblings.push(span);
    else children.set(parentId, [span]);
  }

  // Walk the tree with siblings in start order, so every step comes right
  // after the step it nests under, even when tool calls run in parallel.
  // Parallel calls can start in the same millisecond, and synced rows come in
  // no set order, so ties go by span ID: the order then doesn't change from
  // one render to the next. Depth counts visible ancestors only, so a model
  // step inside the hidden model_generation sits directly under its agent.
  const steps: RunStep[] = [];
  const visited = new Set<string>([root.spanId]);
  const visit = (parentId: string, depth: number) => {
    const siblings = (children.get(parentId) ?? []).sort(
      (a, b) => time(a.startedAt) - time(b.startedAt) || compareText(a.spanId, b.spanId),
    );
    for (const span of siblings) {
      if (visited.has(span.spanId)) continue; // guards against cycles in bad data
      visited.add(span.spanId);
      const visible = VISIBLE_SPAN_TYPES.has(span.spanType) || hasError(span);
      if (visible) steps.push(toStep(span, root, depth, status));
      visit(span.spanId, visible ? depth + 1 : depth);
    }
  };
  visit(root.spanId, 0);
  return steps;
}

function toStep(span: MastraSpan, root: MastraSpan, depth: number, runState: RunStatus): RunStep {
  const kind = stepKind(span);
  return {
    id: `${span.traceId}:${span.spanId}`,
    spanId: span.spanId,
    kind,
    spanType: span.spanType,
    label: stepLabel(span, kind),
    depth,
    status: stepStatus(span, root, runState),
    startedAt: span.startedAt,
    endedAt: span.endedAt,
    errorMessage: errorMessage(span.error),
    toolName: null,
    inputSummary: null,
    resultSummary: null,
  };
}

function stepKind(span: MastraSpan): StepKind {
  const type = span.spanType;
  if (type.startsWith("model_")) return "model";
  if (type === "tool_call" || type === "mcp_tool_call") return "tool";
  if (type.startsWith("workflow_")) return "workflow";
  if (type === "agent_run") return "agent";
  return hasError(span) ? "error" : "other";
}

function stepLabel(span: MastraSpan, kind: StepKind): string {
  if (kind === "tool") return span.entityName || span.entityId || span.name;
  if (kind === "model") return "Model call";
  return span.name;
}

function stepStatus(span: MastraSpan, root: MastraSpan, runState: RunStatus): StepStatus {
  if (wasCutOff(span, root, runState)) return "stopped";
  if (hasError(span)) return "failed";
  // Mastra records a model error, and the runner a timeout, on the root
  // alone, so the step that was going when the run failed ends without one.
  // A step still open in a failed run will never finish.
  if (runState === "failed") return !span.endedAt || endedWithRoot(span, root) ? "failed" : "completed";
  // In a running or completed run an open step is only waiting for its end
  // to flush.
  return span.endedAt ? "completed" : "running";
}

// A cancel or a restart stops whatever was in flight. A restart leaves those
// spans open. An abort ends them along with the root, without an error unless
// the step's own work threw the AbortError. A run can also fail by stopping
// itself: a record tool's database error, or the cost backstop, aborts the
// calls alongside it with an AbortError, so those were stopped even though the
// run failed. A timeout's calls carry a TimeoutError instead, and still fail
// with the run.
function wasCutOff(span: MastraSpan, root: MastraSpan, runState: RunStatus): boolean {
  if (runState === "failed") return hasError(span) && isAbortError(span.error);
  if (runState !== "cancelled" && runState !== "interrupted") return false;
  if (!span.endedAt) return true;
  if (hasError(span)) return isAbortError(span.error);
  return endedWithRoot(span, root);
}

function endedWithRoot(span: MastraSpan, root: MastraSpan): boolean {
  return (
    span.endedAt !== null &&
    root.endedAt !== null &&
    root.endedAt.getTime() - span.endedAt.getTime() <= ENDED_WITH_ROOT_MS
  );
}

function hasError(span: MastraSpan): boolean {
  return span.error !== null && span.error !== undefined;
}

// Span errors are JSON written by Mastra, or by the runner for an abort, so
// read them defensively.
function errorField(error: unknown, field: "message" | "name"): string | null {
  if (typeof error !== "object" || error === null) return null;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" && value !== "" ? value : null;
}

function errorMessage(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (typeof error === "string") return error;
  return errorField(error, "message") ?? errorField(error, "name") ?? "Unknown error";
}

// An aborted run is a cancellation, not a failure.
function isAbortError(error: unknown): boolean {
  return errorField(error, "name") === "AbortError";
}

// Each tool span's call ID, by its step's ID (`toStep`).
function toolCallIdsByStep(spans: readonly SyncedSpan[]): Map<string, string> {
  const ids = new Map<string, string>();
  for (const span of spans) {
    if (span.toolCallId) ids.set(`${span.traceId}:${span.spanId}`, span.toolCallId);
  }
  return ids;
}

// Entries are keyed by tool call, so runs can tell which ones are taken.
function toolInvocationsDuring(
  startedAt: Date | null,
  endedAt: Date | null,
  messages: readonly ParsedMessage[],
): [string, ToolInvocation][] {
  if (!startedAt) return [];
  const from = startedAt.getTime() - MESSAGE_WINDOW_LEAD_MS;
  const to = endedAt ? endedAt.getTime() : Number.POSITIVE_INFINITY;
  const inWindow = messages
    .filter((message) => {
      const at = message.createdAt?.getTime();
      return at !== undefined && at >= from && at <= to;
    })
    .sort((a, b) => time(a.createdAt) - time(b.createdAt));

  // A call and its result can be saved as separate entries, so merge them by
  // call ID. The map keeps first-seen order.
  const byCallId = new Map<string, ToolInvocation>();
  for (const message of inWindow) {
    message.toolInvocations.forEach((invocation, index) => {
      const key = invocation.toolCallId || `${message.id}:${index}`;
      const previous = byCallId.get(key);
      byCallId.set(key, previous ? mergeInvocations(previous, invocation) : invocation);
    });
  }
  return [...byCallId.entries()];
}

function mergeInvocations(earlier: ToolInvocation, later: ToolInvocation): ToolInvocation {
  return {
    toolCallId: earlier.toolCallId,
    toolName: earlier.toolName || later.toolName,
    state: later.state || earlier.state,
    args: later.args === undefined ? earlier.args : later.args,
    result: later.result === undefined ? earlier.result : later.result,
    error: later.error ?? earlier.error,
  };
}

// A tool span is labelled with the tool's name or, failing that, a span name
// such as "tool: 'webSearch'". Messages use the key the tool was registered
// under, so compare ignoring case and punctuation: "web-search" matches
// "webSearch".
const TOOL_SPAN_NAME = /^(?:mcp_)?tool: '([^']*)'/;

function toolKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function spanToolName(label: string): string {
  return TOOL_SPAN_NAME.exec(label)?.[1] ?? label;
}

function toolNamesMatch(label: string, toolName: string): boolean {
  const key = toolKey(toolName);
  return key !== "" && toolKey(spanToolName(label)) === key;
}

// Unknown times sort last.
function time(date: Date | null): number {
  return date ? date.getTime() : Number.POSITIVE_INFINITY;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
