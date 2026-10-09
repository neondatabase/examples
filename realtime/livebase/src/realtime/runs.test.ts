import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MastraSpan } from "~/db/mastra-schema";
import type { LeadStatus } from "~/db/schema";
import type { Run, RunStatus, RunStep, SyncedSpan } from "~/lib/types";
import type { ParsedMessage, ToolInvocation } from "~/realtime/message-content";
import {
  attachToolDetails,
  buildRuns,
  currentActivity,
  currentStep,
  groupSpansByLead,
  runStatus,
} from "~/realtime/runs";

// Span rows as they sync from mastra_ai_spans. Times are milliseconds after
// T0, and NOW is a minute in, past the 10 s grace for a recent lead change.
const LEAD_ID = "lead-1";
const T0 = Date.parse("2026-01-01T12:00:00.000Z");
const at = (ms: number) => new Date(T0 + ms);
const NOW = at(60_000);

const ABORT = { name: "AbortError", message: "The operation was aborted" };

function lead(status: LeadStatus, updatedAt = at(0)) {
  return { id: LEAD_ID, status, updatedAt };
}

function span(fields: Partial<MastraSpan> & Pick<MastraSpan, "spanId">): MastraSpan {
  return {
    traceId: "trace-1",
    parentSpanId: null,
    name: fields.spanId,
    spanType: "agent_run",
    entityType: null,
    entityId: null,
    entityName: null,
    resourceId: null,
    threadId: LEAD_ID,
    runId: null,
    startedAt: at(0),
    endedAt: null,
    error: null,
    ...fields,
  };
}

// The enrichment agent's root span, open unless `endedAt` is given.
function rootSpan(fields: Partial<MastraSpan> = {}): MastraSpan {
  return span({
    spanId: "root",
    name: "agent run: 'enrichment-agent'",
    entityType: "agent",
    entityId: "enrichment-agent",
    entityName: "Enrichment agent",
    ...fields,
  });
}

function childSpan(
  spanId: string,
  spanType: string,
  parentSpanId: string,
  fields: Partial<MastraSpan> = {},
): MastraSpan {
  return span({ spanId, spanType, parentSpanId, ...fields });
}

function toolSpan(spanId: string, toolName: string, parentSpanId: string, fields: Partial<MastraSpan> = {}) {
  return childSpan(spanId, "tool_call", parentSpanId, {
    name: `tool: '${toolName}'`,
    entityType: "tool",
    entityId: toolName,
    entityName: toolName,
    ...fields,
  });
}

function onlyRun(spans: MastraSpan[], leadState = lead("enriching"), now = NOW): Run {
  const runs = buildRuns(spans, leadState, now);
  assert.equal(runs.length, 1);
  return runs[0];
}

function statuses(run: Run): [string, string][] {
  return run.steps.map((step) => [step.spanId, step.status]);
}

describe("runStatus", () => {
  it("is running while the root is open and the lead is processing", () => {
    assert.equal(runStatus(rootSpan(), lead("enriching"), NOW), "running");
  });

  it("is completed once the root has ended without an error", () => {
    assert.equal(runStatus(rootSpan({ endedAt: at(5_000) }), lead("ready"), NOW), "completed");
  });

  it("is failed when the root recorded an error", () => {
    const root = rootSpan({ endedAt: at(5_000), error: { name: "APIError", message: "Model unavailable" } });
    assert.equal(runStatus(root, lead("failed"), NOW), "failed");
  });

  it("is cancelled when the root's error is an AbortError", () => {
    assert.equal(runStatus(rootSpan({ endedAt: at(5_000), error: ABORT }), lead("ready"), NOW), "cancelled");
  });

  it("counts a TimeoutError as a failure, not a cancel", () => {
    const root = rootSpan({ endedAt: at(5_000), error: { name: "TimeoutError", message: "Enrichment timed out" } });
    assert.equal(runStatus(root, lead("failed"), NOW), "failed");
  });

  it("doesn't take an error that only mentions an abort in its message for a cancel", () => {
    const root = rootSpan({ endedAt: at(5_000), error: { name: "Error", message: "Request aborted by peer" } });
    assert.equal(runStatus(root, lead("failed"), NOW), "failed");
  });

  it("is interrupted when the root never ended and the lead stopped processing", () => {
    assert.equal(runStatus(rootSpan(), lead("failed"), NOW), "interrupted");
  });

  it("stays running for ten seconds after the lead last changed", () => {
    assert.equal(runStatus(rootSpan(), lead("ready", at(51_000)), NOW), "running");
    assert.equal(runStatus(rootSpan(), lead("ready", at(50_000)), NOW), "interrupted");
  });

  it("treats a lead change stamped later than the browser's clock as recent", () => {
    assert.equal(runStatus(rootSpan(), lead("ready", at(61_000)), NOW), "running");
  });
});

describe("buildRuns", () => {
  it("builds one run per trace on the lead and ignores other leads' spans", () => {
    const runs = buildRuns(
      [
        rootSpan(),
        toolSpan("search", "webSearch", "root", { startedAt: at(1_000) }),
        rootSpan({ traceId: "trace-2", threadId: "lead-2" }),
        rootSpan({ traceId: "trace-3", threadId: null }),
      ],
      lead("enriching"),
      NOW,
    );
    assert.deepEqual(
      runs.map((run) => [run.traceId, run.steps.length]),
      [["trace-1", 1]],
    );
  });

  it("names extraction and enrichment runs, and other runs by their entity or span name", () => {
    const runs = buildRuns(
      [
        rootSpan({ traceId: "extraction", entityId: "extraction-agent", entityName: "Extraction agent" }),
        rootSpan({ traceId: "enrichment", entityId: null, entityName: "enrichment-agent" }),
        rootSpan({ traceId: "summary", entityId: "summary-agent", entityName: "Summary agent" }),
        rootSpan({ traceId: "unnamed", entityId: null, entityName: null, name: "agent run: 'unknown'" }),
      ],
      lead("enriching"),
      NOW,
    );
    assert.deepEqual(
      runs.map((run) => [run.traceId, run.kind, run.label]),
      [
        ["extraction", "extraction", "Extraction"],
        ["enrichment", "enrichment", "Enrichment"],
        ["summary", "other", "Summary agent"],
        ["unnamed", "other", "agent run: 'unknown'"],
      ],
    );
  });

  it("reports the root's error message, or the error's name when it has no message", () => {
    const runs = buildRuns(
      [
        rootSpan({ endedAt: at(5_000), error: { name: "APIError", message: "Model unavailable" } }),
        rootSpan({ traceId: "trace-2", endedAt: at(5_000), error: { name: "TimeoutError" } }),
      ],
      lead("failed"),
      NOW,
    );
    assert.deepEqual(
      runs.map((run) => run.errorMessage),
      ["Model unavailable", "TimeoutError"],
    );
  });

  it("uses the earliest agent_run as the root when every span has a parent", () => {
    const run = onlyRun([
      rootSpan({ spanId: "later", parentSpanId: "outside", startedAt: at(100) }),
      rootSpan({ spanId: "earlier", parentSpanId: "outside", startedAt: at(50), entityId: "extraction-agent" }),
    ]);
    assert.equal(run.kind, "extraction");
    assert.deepEqual(run.startedAt, at(50));
    assert.deepEqual(
      run.steps.map((step) => step.spanId),
      ["later"],
    );
  });

  it("has no run until the trace's root span syncs", () => {
    const spans = [
      childSpan("step-1", "model_step", "generation"),
      toolSpan("search", "webSearch", "step-1"),
    ];
    assert.deepEqual(buildRuns(spans, lead("enriching"), NOW), []);
  });

  it("shows each model step as a model call and hides the generation around them", () => {
    const run = onlyRun([
      rootSpan(),
      childSpan("generation", "model_generation", "root", { startedAt: at(100) }),
      childSpan("step-1", "model_step", "generation", { startedAt: at(200) }),
      childSpan("inference-1", "model_inference", "step-1", { startedAt: at(210) }),
      toolSpan("search", "webSearch", "step-1", { startedAt: at(1_000) }),
      childSpan("step-2", "model_step", "generation", { startedAt: at(3_000) }),
    ]);
    assert.deepEqual(
      run.steps.map((step) => [step.id, step.kind, step.label, step.depth]),
      [
        ["trace-1:step-1", "model", "Model call", 0],
        ["trace-1:search", "tool", "webSearch", 1],
        ["trace-1:step-2", "model", "Model call", 0],
      ],
    );
  });

  it("shows a hidden span when it failed", () => {
    const run = onlyRun([
      rootSpan(),
      childSpan("inference", "model_inference", "root", { startedAt: at(100), endedAt: at(900) }),
      childSpan("guard", "processor_run", "root", {
        name: "output guardrail",
        startedAt: at(1_000),
        endedAt: at(1_100),
        error: { message: "Blocked by guardrail" },
      }),
    ]);
    assert.deepEqual(
      run.steps.map((step) => [step.spanId, step.kind, step.label, step.status, step.errorMessage]),
      [["guard", "error", "output guardrail", "failed", "Blocked by guardrail"]],
    );
  });

  it("puts each step right after its parent, with siblings in start order", () => {
    // Parallel tool calls: fetchPage runs a sub-agent that starts after
    // webSearch, but its row still belongs under fetchPage.
    const run = onlyRun([
      childSpan("step-2", "model_step", "generation", { startedAt: at(3_000) }),
      toolSpan("search", "webSearch", "step-1", { startedAt: at(1_010) }),
      rootSpan(),
      childSpan("reader", "agent_run", "fetch", { name: "agent run: 'page-reader'", startedAt: at(1_050) }),
      childSpan("generation", "model_generation", "root", { startedAt: at(100) }),
      toolSpan("fetch", "fetchPage", "step-1", { startedAt: at(1_000) }),
      childSpan("step-1", "model_step", "generation", { startedAt: at(200) }),
    ]);
    assert.deepEqual(
      run.steps.map((step) => [step.spanId, step.depth]),
      [
        ["step-1", 0],
        ["fetch", 1],
        ["reader", 2],
        ["search", 1],
        ["step-2", 0],
      ],
    );
  });

  it("hangs a span whose parent hasn't synced yet off the root", () => {
    const run = onlyRun([rootSpan(), toolSpan("search", "webSearch", "not-synced-yet")]);
    assert.deepEqual(
      run.steps.map((step) => [step.spanId, step.depth]),
      [["search", 0]],
    );
  });

  it("leaves out spans that only parent each other instead of looping", () => {
    const run = onlyRun([rootSpan(), toolSpan("a", "webSearch", "b"), toolSpan("b", "webSearch", "a")]);
    assert.deepEqual(run.steps, []);
  });

  it("marks steps of a running run as completed, failed, or still running", () => {
    const run = onlyRun([
      rootSpan(),
      childSpan("step-1", "model_step", "root", { startedAt: at(100), endedAt: at(900) }),
      toolSpan("fetch", "fetchPage", "root", {
        startedAt: at(1_000),
        endedAt: at(1_500),
        error: { message: "404 Not Found" },
      }),
      toolSpan("search", "webSearch", "root", { startedAt: at(2_000) }),
    ]);
    assert.equal(run.status, "running");
    assert.deepEqual(statuses(run), [
      ["step-1", "completed"],
      ["fetch", "failed"],
      ["search", "running"],
    ]);
  });

  it("keeps a step open in a completed run running until its end syncs", () => {
    const run = onlyRun([rootSpan({ endedAt: at(5_000) }), toolSpan("search", "webSearch", "root")], lead("ready"));
    assert.equal(run.status, "completed");
    assert.deepEqual(statuses(run), [["search", "running"]]);
  });

  it("fails a step left open in a failed run", () => {
    const run = onlyRun(
      [rootSpan({ endedAt: at(5_000), error: { name: "TimeoutError" } }), toolSpan("search", "webSearch", "root")],
      lead("failed"),
    );
    assert.equal(run.status, "failed");
    assert.deepEqual(statuses(run), [["search", "failed"]]);
  });

  it("fails the steps that were going when a run failed and keeps the ones that had finished", () => {
    const run = onlyRun(
      [
        rootSpan({ endedAt: at(10_000), error: { name: "AI_APICallError", message: "Too Many Requests" } }),
        childSpan("generation", "model_generation", "root", { startedAt: at(100), endedAt: at(9_998) }),
        childSpan("step-1", "model_step", "generation", { startedAt: at(200), endedAt: at(2_000) }),
        toolSpan("fetch", "fetchPage", "step-1", {
          startedAt: at(500),
          endedAt: at(1_500),
          error: { name: "Error", message: "404 Not Found" },
        }),
        toolSpan("search", "webSearch", "step-1", { startedAt: at(600), endedAt: at(1_800) }),
        // The model error ends the step it happened in, without an error, just
        // before the root records it.
        childSpan("step-2", "model_step", "generation", { startedAt: at(3_000), endedAt: at(9_994) }),
      ],
      lead("failed"),
    );
    assert.equal(run.status, "failed");
    assert.deepEqual(statuses(run), [
      ["step-1", "completed"],
      ["fetch", "failed"],
      ["search", "completed"],
      ["step-2", "failed"],
    ]);
    // The run carries the error; the step doesn't repeat it.
    assert.equal(run.steps[3].errorMessage, null);
  });

  it("stops the steps a cancel cut off and keeps the ones that had finished", () => {
    const run = onlyRun(
      [
        rootSpan({ endedAt: at(10_000), error: ABORT }),
        childSpan("generation", "model_generation", "root", { startedAt: at(100), endedAt: at(10_000) }),
        childSpan("step-1", "model_step", "generation", { startedAt: at(200), endedAt: at(2_000) }),
        toolSpan("fetch", "fetchPage", "step-1", {
          startedAt: at(500),
          endedAt: at(1_500),
          error: { name: "Error", message: "404 Not Found" },
        }),
        // An abort ends the open spans along with the root.
        childSpan("step-2", "model_step", "generation", { startedAt: at(3_000), endedAt: at(10_000) }),
        toolSpan("search", "webSearch", "step-2", { startedAt: at(4_000), endedAt: at(9_990), error: ABORT }),
        toolSpan("lookup", "lookupCompany", "step-2", { startedAt: at(4_100) }),
      ],
      lead("enriching"),
    );
    assert.equal(run.status, "cancelled");
    assert.deepEqual(statuses(run), [
      ["step-1", "completed"],
      ["fetch", "failed"],
      ["step-2", "stopped"],
      ["search", "stopped"],
      ["lookup", "stopped"],
    ]);
  });

  it("stops the calls a run's own stop cut off, though the run failed", () => {
    // A record tool's database error fails the run. enrichLead then aborts
    // the calls alongside it with an AbortError, so those read as stopped.
    const stop = { name: "AbortError", message: "Enrichment stopped: database error" };
    const run = onlyRun(
      [
        rootSpan({ endedAt: at(2_000), error: { name: "Error", message: "connection terminated" } }),
        childSpan("step-1", "model_step", "root", { startedAt: at(10), endedAt: at(1_990) }),
        toolSpan("record", "recordFinding", "step-1", {
          startedAt: at(100),
          endedAt: at(1_500),
          error: { name: "Error", message: "connection terminated" },
        }),
        toolSpan("search", "webSearch", "step-1", { startedAt: at(101), endedAt: at(1_501), error: stop }),
        toolSpan("read", "readWebPage", "step-1", { startedAt: at(102), endedAt: at(1_502), error: stop }),
      ],
      lead("failed"),
    );
    assert.equal(run.status, "failed");
    assert.deepEqual(
      run.steps.map((step) => [step.spanId, step.status, step.errorMessage]),
      [
        ["step-1", "failed", null],
        ["record", "failed", "connection terminated"],
        ["search", "stopped", "Enrichment stopped: database error"],
        ["read", "stopped", "Enrichment stopped: database error"],
      ],
    );
    // The saved calls don't turn the stopped steps back into failures.
    const [detailed] = attachToolDetails(
      [run],
      [
        message(
          "m1",
          at(500),
          failedCall("c1", "recordFinding", { subject: "company", label: "industry", value: "Email" }, "connection terminated"),
          failedCall("c2", "webSearch", { query: "Resend funding" }, stop.message),
          call("c3", "readWebPage", { url: "https://resend.com/about" }),
        ),
      ],
    );
    assert.deepEqual(
      detailed.steps.map((step) => [step.label, step.status]),
      [
        ["Model call", "failed"],
        ["Recording industry: Email", "failed"],
        ["Searching the web for Resend funding", "stopped"],
        ["Reading resend.com/about", "stopped"],
      ],
    );
  });

  it("still fails the calls a timeout cut off", () => {
    const timeout = { name: "TimeoutError", message: "Timed out" };
    const run = onlyRun(
      [
        rootSpan({ endedAt: at(180_000), error: timeout }),
        toolSpan("search", "webSearch", "root", { startedAt: at(100), endedAt: at(179_990), error: timeout }),
      ],
      lead("failed"),
      at(200_000),
    );
    assert.deepEqual(statuses(run), [["search", "failed"]]);
  });

  it("orders siblings that start in the same millisecond by span ID, whatever order they sync in", () => {
    const parallel = (order: string[]) =>
      onlyRun([
        rootSpan(),
        ...order.map((spanId) => toolSpan(spanId, "recordFinding", "root", { startedAt: at(100) })),
      ]).steps.map((step) => step.spanId);
    assert.deepEqual(parallel(["zz", "aa", "mm"]), ["aa", "mm", "zz"]);
    assert.deepEqual(parallel(["mm", "zz", "aa"]), ["aa", "mm", "zz"]);
  });

  it("stops the steps a server restart left open", () => {
    const run = onlyRun(
      [
        rootSpan(),
        childSpan("step-1", "model_step", "root", { startedAt: at(100), endedAt: at(900) }),
        toolSpan("fetch", "fetchPage", "step-1", {
          startedAt: at(500),
          endedAt: at(800),
          error: { message: "404 Not Found" },
        }),
        childSpan("step-2", "model_step", "root", { startedAt: at(1_000) }),
        toolSpan("search", "webSearch", "step-2", { startedAt: at(1_100) }),
      ],
      lead("failed"),
    );
    assert.equal(run.status, "interrupted");
    assert.deepEqual(statuses(run), [
      ["step-1", "completed"],
      ["fetch", "failed"],
      ["step-2", "stopped"],
      ["search", "stopped"],
    ]);
  });

  // An extraction cut off by a restart, then an enrichment started at 30 s.
  const olderOpenRun = [
    rootSpan({ traceId: "old", entityId: "extraction-agent" }),
    toolSpan("search", "webSearch", "root", { traceId: "old", startedAt: at(1_000) }),
    rootSpan({ traceId: "new", startedAt: at(30_000) }),
  ];

  it("reads an older unended run as interrupted once a newer run has been going for a while", () => {
    const runs = buildRuns(olderOpenRun, lead("enriching"), at(45_000));
    assert.deepEqual(
      runs.map((each) => [each.traceId, each.status]),
      [
        ["old", "interrupted"],
        ["new", "running"],
      ],
    );
    assert.deepEqual(statuses(runs[0]), [["search", "stopped"]]);
  });

  it("gives an older unended run the same grace after a newer run starts", () => {
    const runs = buildRuns(olderOpenRun, lead("enriching"), at(35_000));
    assert.deepEqual(
      runs.map((each) => [each.traceId, each.status]),
      [
        ["old", "running"],
        ["new", "running"],
      ],
    );
  });
});

// Extraction traces recorded against the real stack (Mastra 1.68), trimmed
// to the columns runs.ts reads. Each has agent_run → model_generation →
// model_step → model_inference, with every span on the lead's thread.
type RecordedSpan = [spanId: string, parentSpanId: string | null, spanType: string, startedAt: string, endedAt: string];

function recordedTrace(traceId: string, rows: RecordedSpan[], rootError: MastraSpan["error"] = null): MastraSpan[] {
  const names: Record<string, string> = {
    agent_run: "agent run: 'extraction-agent'",
    model_generation: "llm: 'claude-haiku-4-5'",
    model_step: "step: 0",
    model_inference: "inference: 0",
  };
  return rows.map(([spanId, parentSpanId, spanType, startedAt, endedAt]) =>
    span({
      traceId,
      spanId,
      parentSpanId,
      spanType,
      name: names[spanType],
      entityType: "agent",
      entityId: "extraction-agent",
      entityName: "Extraction agent",
      startedAt: new Date(startedAt),
      endedAt: new Date(endedAt),
      error: parentSpanId === null ? rootError : null,
    }),
  );
}

// A gateway 429. Mastra put the error on the root alone and ended the model
// step normally, 6 ms before the root.
const rateLimited = recordedTrace(
  "4c56a882d996b75120dde7d55db432d0",
  [
    ["c2855d27f985f56b", null, "agent_run", "2026-10-02T23:53:47.525Z", "2026-10-02T23:53:47.901Z"],
    ["2be459d2d52c0f9b", "c2855d27f985f56b", "model_generation", "2026-10-02T23:53:47.527Z", "2026-10-02T23:53:47.900Z"],
    ["3145b14b832c9039", "2be459d2d52c0f9b", "model_step", "2026-10-02T23:53:47.530Z", "2026-10-02T23:53:47.895Z"],
    ["df6febbf49d2af4a", "3145b14b832c9039", "model_inference", "2026-10-02T23:53:47.530Z", "2026-10-02T23:53:47.894Z"],
  ],
  { name: "AI_APICallError", message: "Too Many Requests" },
);

// Archived mid-extraction. The abort ended every span with the root, and the
// runner recorded the AbortError on the root.
const abortedRows: RecordedSpan[] = [
  ["4b1d99cab48ddfa8", null, "agent_run", "2026-10-03T00:02:00.016Z", "2026-10-03T00:02:00.894Z"],
  ["bd5911d371487efe", "4b1d99cab48ddfa8", "model_generation", "2026-10-03T00:02:00.022Z", "2026-10-03T00:02:00.894Z"],
  ["dc8a90a4fdee6fd8", "bd5911d371487efe", "model_step", "2026-10-03T00:02:00.025Z", "2026-10-03T00:02:00.894Z"],
  ["01c4e619a136ecc6", "dc8a90a4fdee6fd8", "model_inference", "2026-10-03T00:02:00.026Z", "2026-10-03T00:02:00.894Z"],
];
const cancelled = recordedTrace("c8d08fbb947a71c061c9be5b7d134f24", abortedRows, { name: "AbortError", message: "Cancelled" });

// The time limit aborts the same way as a cancel, and the runner records a
// TimeoutError instead (recordAbortedRun).
const timedOut = recordedTrace("c8d08fbb947a71c061c9be5b7d134f24", abortedRows, {
  name: "TimeoutError",
  message: "Timed out",
});

// A successful extraction: its model step also ends a few ms before the root.
const completed = recordedTrace("3caf51a229635cdbde8b76e2f3c1e714", [
  ["73fe354b6e364aec", null, "agent_run", "2026-10-03T00:00:03.650Z", "2026-10-03T00:00:06.267Z"],
  ["4aa705a3d1292840", "73fe354b6e364aec", "model_generation", "2026-10-03T00:00:03.652Z", "2026-10-03T00:00:06.265Z"],
  ["282fc8c140fe2e49", "4aa705a3d1292840", "model_step", "2026-10-03T00:00:03.654Z", "2026-10-03T00:00:06.263Z"],
  ["36a1fd9b81a84599", "282fc8c140fe2e49", "model_inference", "2026-10-03T00:00:03.655Z", "2026-10-03T00:00:06.263Z"],
]);

// Mid-run every span is inserted with a NULL end.
const inFlight = cancelled.map((each) => ({ ...each, endedAt: null, error: null }));

describe("buildRuns on recorded extraction traces", () => {
  const RECORDED_NOW = new Date("2026-10-03T00:05:00.000Z");
  const recordedRun = (spans: MastraSpan[], status: LeadStatus) =>
    onlyRun(spans, lead(status, new Date("2026-10-03T00:02:01.000Z")), RECORDED_NOW);

  it("fails the model call a 429 failed, though only the root has the error", () => {
    const run = recordedRun(rateLimited, "failed");
    assert.deepEqual([run.status, run.errorMessage], ["failed", "Too Many Requests"]);
    assert.deepEqual(statuses(run), [["3145b14b832c9039", "failed"]]);
  });

  it("fails the model call a timeout cut off", () => {
    const run = recordedRun(timedOut, "failed");
    assert.deepEqual([run.status, run.errorMessage], ["failed", "Timed out"]);
    assert.deepEqual(statuses(run), [["dc8a90a4fdee6fd8", "failed"]]);
  });

  it("stops the model call a cancel cut off", () => {
    const run = recordedRun(cancelled, "ready");
    assert.deepEqual([run.status, run.errorMessage], ["cancelled", "Cancelled"]);
    assert.deepEqual(statuses(run), [["dc8a90a4fdee6fd8", "stopped"]]);
  });

  it("keeps the model call of a successful run completed", () => {
    const run = recordedRun(completed, "ready");
    assert.equal(run.status, "completed");
    assert.deepEqual(statuses(run), [["282fc8c140fe2e49", "completed"]]);
  });

  it("shows the model call running mid-run", () => {
    const run = recordedRun(inFlight, "extracting");
    assert.equal(run.status, "running");
    assert.deepEqual(statuses(run), [["dc8a90a4fdee6fd8", "running"]]);
    assert.equal(currentStep(run)?.label, "Model call");
  });
});

describe("groupSpansByLead", () => {
  it("groups spans by their threadId, in their original order", () => {
    const first = toolSpan("a", "webSearch", "root");
    const other = toolSpan("b", "webSearch", "root", { threadId: "lead-2" });
    const second = toolSpan("c", "webSearch", "root");
    const groups = groupSpansByLead([first, other, second]);
    assert.deepEqual([...groups.keys()], [LEAD_ID, "lead-2"]);
    assert.deepEqual(groups.get(LEAD_ID), [first, second]);
    assert.deepEqual(groups.get("lead-2"), [other]);
  });

  it("drops spans without a threadId", () => {
    const groups = groupSpansByLead([toolSpan("a", "webSearch", "root", { threadId: null })]);
    assert.equal(groups.size, 0);
  });
});

// Runs and steps as buildRuns returns them, and messages as message-content
// parses them.
function modelStep(spanId: string): RunStep {
  return { ...toolStep(spanId, "Model call"), kind: "model", spanType: "model_step", depth: 0 };
}

function toolStep(spanId: string, label: string): RunStep {
  return {
    id: `trace:${spanId}`,
    spanId,
    kind: "tool",
    spanType: "tool_call",
    label,
    depth: 1,
    status: "completed",
    startedAt: null,
    endedAt: null,
    errorMessage: null,
    toolName: null,
    inputSummary: null,
    resultSummary: null,
  };
}

function run(
  traceId: string,
  startedAt: Date | null,
  endedAt: Date | null,
  steps: RunStep[],
  status: RunStatus = endedAt ? "completed" : "running",
): Run {
  return {
    traceId,
    kind: "enrichment",
    label: "Enrichment",
    status,
    startedAt,
    endedAt,
    errorMessage: null,
    steps,
  };
}

function message(id: string, createdAt: Date | null, ...toolInvocations: ToolInvocation[]): ParsedMessage {
  return { id, createdAt, toolInvocations };
}

function call(toolCallId: string, toolName: string, args: unknown, result?: unknown): ToolInvocation {
  return { toolCallId, toolName, state: result === undefined ? "call" : "result", args, result, error: null };
}

// A call that threw: Mastra saves its error text and no result.
function failedCall(toolCallId: string, toolName: string, args: unknown, error: string): ToolInvocation {
  return { toolCallId, toolName, state: "output-error", args, result: undefined, error };
}

function withStatus(step: RunStep, status: RunStep["status"], errorMessage: string | null = null): RunStep {
  return { ...step, status, errorMessage };
}

function outcome(target: Run): [string, string, string | null, string | null][] {
  return target.steps.map((step) => [step.label, step.status, step.errorMessage, step.resultSummary]);
}

function details(target: Run): [string | null, string | null, string | null][] {
  return target.steps.map((step) => [step.toolName, step.inputSummary, step.resultSummary]);
}

const VALIDATION_MESSAGE =
  "Tool input validation failed for webSearch. Please fix the following errors and try again:\n" +
  '- query: Expected string, received number\n\nProvided arguments: {"query":42}';

describe("attachToolDetails", () => {
  it("fills tool steps in order with the calls of the same tool", () => {
    const enrichment = run("trace", at(0), at(10_000), [
      toolStep("s1", "webSearch"),
      toolStep("s2", "lookupCompany"),
      toolStep("s3", "webSearch"),
    ]);
    const [detailed] = attachToolDetails(
      [enrichment],
      [
        message(
          "m1",
          at(2_000),
          call("c1", "webSearch", { query: "acme" }, { hits: 3 }),
          call("c2", "lookupCompany", { domain: "acme.com" }, { name: "Acme" }),
        ),
        message("m2", at(6_000), call("c3", "webSearch", { query: "acme pricing" }, { hits: 1 })),
      ],
    );
    assert.deepEqual(details(detailed), [
      ["webSearch", '{"query":"acme"}', '{"hits":3}'],
      ["lookupCompany", '{"domain":"acme.com"}', '{"name":"Acme"}'],
      ["webSearch", '{"query":"acme pricing"}', '{"hits":1}'],
    ]);
  });

  it("matches tool names ignoring case and punctuation, and reads them out of span names", () => {
    const enrichment = run("trace", at(0), at(10_000), [
      toolStep("s1", "tool: 'web-search'"),
      toolStep("s2", "Lookup_Company"),
      toolStep("s3", "mcp_tool: 'fetch-page'"),
    ]);
    const [detailed] = attachToolDetails(
      [enrichment],
      [
        message(
          "m1",
          at(1_000),
          call("c1", "webSearch", { query: "acme" }),
          call("c2", "lookupCompany", { domain: "acme.com" }),
          call("c3", "fetchPage", { url: "https://acme.com" }),
        ),
      ],
    );
    assert.deepEqual(
      detailed.steps.map((step) => step.toolName),
      ["webSearch", "lookupCompany", "fetchPage"],
    );
  });

  it("doesn't fill a step from a tool whose name is only part of the step's", () => {
    const enrichment = run("trace", at(0), at(10_000), [toolStep("s1", "webSearch")]);
    const [detailed] = attachToolDetails([enrichment], [message("m1", at(1_000), call("c1", "search", { q: "acme" }))]);
    assert.deepEqual(details(detailed), [[null, null, null]]);
  });

  it("merges a call and its result saved in separate messages into one invocation", () => {
    const enrichment = run("trace", at(0), at(10_000), [toolStep("s1", "webSearch"), toolStep("s2", "webSearch")]);
    const [detailed] = attachToolDetails(
      [enrichment],
      [
        message("m2", at(2_000), call("c1", "webSearch", undefined, { hits: 2 })),
        message("m1", at(1_000), call("c1", "webSearch", { query: "acme" })),
      ],
    );
    assert.deepEqual(details(detailed), [
      ["webSearch", '{"query":"acme"}', '{"hits":2}'],
      [null, null, null],
    ]);
  });

  it("keeps calls without a toolCallId apart", () => {
    const enrichment = run("trace", at(0), at(10_000), [toolStep("s1", "webSearch"), toolStep("s2", "webSearch")]);
    const [detailed] = attachToolDetails(
      [enrichment],
      [message("m1", at(1_000), call("", "webSearch", { query: "a" }), call("", "webSearch", { query: "b" }))],
    );
    assert.deepEqual(
      detailed.steps.map((step) => step.inputSummary),
      ['{"query":"a"}', '{"query":"b"}'],
    );
  });

  it("leaves the result empty while a call has none yet", () => {
    const enrichment = run("trace", at(0), null, [toolStep("s1", "webSearch")]);
    const [detailed] = attachToolDetails([enrichment], [message("m1", at(1_000), call("c1", "webSearch", { q: 1 }))]);
    assert.deepEqual(details(detailed), [["webSearch", '{"q":1}', null]]);
  });

  it("only uses messages saved while the run was active, from a second before it started", () => {
    const enrichment = run("trace", at(10_000), at(20_000), [toolStep("s1", "webSearch"), toolStep("s2", "webSearch")]);
    const [detailed] = attachToolDetails(
      [enrichment],
      [
        message("early", at(8_500), call("c1", "webSearch", { query: "early" })),
        message("just-before", at(9_500), call("c2", "webSearch", { query: "just before" })),
        message("late", at(21_000), call("c3", "webSearch", { query: "late" })),
        message("undated", null, call("c4", "webSearch", { query: "undated" })),
      ],
    );
    assert.deepEqual(
      detailed.steps.map((step) => step.inputSummary),
      ['{"query":"just before"}', null],
    );
  });

  it("ends an unended run's window when the next run starts", () => {
    const steps = [toolStep("s1", "webSearch"), toolStep("s2", "webSearch")];
    const interrupted = run("old", at(0), null, steps, "interrupted");
    const running = run("new", at(60_000), null, [toolStep("s3", "webSearch")]);
    const [old, current] = attachToolDetails(
      [interrupted, running],
      [
        message("m1", at(5_000), call("c1", "webSearch", { query: "old" })),
        message("m2", at(70_000), call("c2", "webSearch", { query: "new" })),
      ],
    );
    assert.deepEqual(
      old.steps.map((step) => step.inputSummary),
      ['{"query":"old"}', null],
    );
    assert.deepEqual(
      current.steps.map((step) => step.inputSummary),
      ['{"query":"new"}'],
    );
  });

  it("doesn't give a cancelled run's calls to the run that restarted it", () => {
    // The restart begins 200 ms after the cancel, so its window reaches back
    // over the cancelled run's last call.
    const cancelled = run("cancelled", at(0), at(10_000), [toolStep("s1", "webSearch")], "cancelled");
    const restarted = run("restarted", at(10_200), null, [toolStep("s2", "webSearch")]);
    const result = attachToolDetails(
      [restarted, cancelled],
      [
        message("m1", at(9_800), call("c1", "webSearch", { query: "before edit" })),
        message("m2", at(11_000), call("c2", "webSearch", { query: "after edit" })),
      ],
    );
    assert.deepEqual(
      result.map((each) => [each.traceId, each.steps[0].inputSummary]),
      [
        ["restarted", '{"query":"after edit"}'],
        ["cancelled", '{"query":"before edit"}'],
      ],
    );
  });

  it("returns non-tool steps, and runs without calls, unchanged", () => {
    const model = modelStep("m");
    const withCalls = run("with-calls", at(0), at(10_000), [model, toolStep("s1", "webSearch")]);
    const withoutCalls = run("without-calls", at(20_000), at(30_000), [toolStep("s2", "webSearch")]);
    const [detailed, untouched] = attachToolDetails(
      [withCalls, withoutCalls],
      [message("m1", at(1_000), call("c1", "webSearch", { query: "acme" }))],
    );
    assert.equal(detailed.steps[0], model);
    assert.equal(untouched, withoutCalls);
  });

  it("labels each tool step from its call's input", () => {
    const enrichment = run("trace", at(0), at(10_000), [
      toolStep("s1", "findCompanyWebsite"),
      toolStep("s2", "webSearch"),
      toolStep("s3", "readWebPage"),
      toolStep("s4", "recordFinding"),
      toolStep("s5", "recordColleague"),
    ]);
    const [detailed] = attachToolDetails(
      [enrichment],
      [
        message(
          "m1",
          at(1_000),
          call("c1", "findCompanyWebsite", { name: "Fathom Analytics" }, { ok: true }),
          call("c2", "webSearch", { query: "Dane Knecht" }, { results: [] }),
          call("c3", "readWebPage", { url: "https://resend.com/about" }, { title: "About" }),
          call("c4", "recordFinding", { subject: "person", label: "title", value: "VP Engineering" }, { ok: true }),
          call("c5", "recordColleague", { name: "Jane Doe", confidence: 0.8 }, { ok: true }),
        ),
      ],
    );
    assert.deepEqual(
      detailed.steps.map((step) => step.label),
      [
        "Finding the website for Fathom Analytics",
        "Searching the web for Dane Knecht",
        "Reading resend.com/about",
        "Recorded title: VP Engineering",
        "Added colleague Jane Doe",
      ],
    );
  });

  it("keeps a record step in the present tense until it succeeds", () => {
    const args = { subject: "person", label: "title", value: "CTO" };
    const enrichment = run("trace", at(0), null, [
      withStatus(toolStep("s1", "recordFinding"), "running"),
      toolStep("s2", "recordFinding"),
    ]);
    const [detailed] = attachToolDetails(
      [enrichment],
      [
        message(
          "m1",
          at(1_000),
          call("c1", "recordFinding", args),
          call("c2", "recordFinding", args, { ok: false, reason: "lead_gone", message: "The lead was archived" }),
        ),
      ],
    );
    assert.deepEqual(
      detailed.steps.map((step) => step.label),
      ["Recording title: CTO", "Recording title: CTO"],
    );
  });

  it("keeps the tool's name as the label when its input is missing or unknown", () => {
    const enrichment = run("trace", at(0), at(10_000), [
      toolStep("s1", "webSearch"),
      toolStep("s2", "readWebPage"),
      toolStep("s3", "lookupCompany"),
    ]);
    const [detailed] = attachToolDetails(
      [enrichment],
      [
        message(
          "m1",
          at(1_000),
          call("c1", "webSearch", undefined, { results: [] }),
          call("c2", "readWebPage", { url: 42 }, { title: "About" }),
          call("c3", "lookupCompany", { domain: "acme.com" }, { name: "Acme" }),
        ),
      ],
    );
    assert.deepEqual(
      detailed.steps.map((step) => step.label),
      ["webSearch", "readWebPage", "lookupCompany"],
    );
  });

  it("fails a step whose call threw, with the saved error, even before its span ends", () => {
    const enrichment = run("trace", at(0), null, [
      toolStep("s1", "recordFinding"),
      withStatus(toolStep("s2", "readWebPage"), "running"),
      withStatus(toolStep("s3", "readWebPage"), "failed", "Tool readWebPage failed"),
    ]);
    const [detailed] = attachToolDetails(
      [enrichment],
      [
        message(
          "m1",
          at(1_000),
          failedCall("c1", "recordFinding", { subject: "person", label: "title", value: "CTO" }, "connection refused"),
          failedCall("c2", "readWebPage", { url: "https://acme.com" }, "socket hang up"),
          failedCall("c3", "readWebPage", { url: "https://acme.com/team" }, "socket hang up"),
        ),
      ],
    );
    assert.deepEqual(outcome(detailed), [
      ["Recording title: CTO", "failed", "connection refused", null],
      ["Reading acme.com", "failed", "socket hang up", null],
      // The span's own error comes first.
      ["Reading acme.com/team", "failed", "Tool readWebPage failed", null],
    ]);
  });

  it("leaves a step a cancel cut off stopped", () => {
    const step = withStatus(toolStep("s1", "readWebPage"), "stopped");
    const cancelled = run("trace", at(0), at(10_000), [step], "cancelled");
    const [detailed] = attachToolDetails(
      [cancelled],
      [message("m1", at(1_000), failedCall("c1", "readWebPage", { url: "https://acme.com" }, "This operation was aborted"))],
    );
    assert.equal(detailed.steps[0].status, "stopped");
  });

  it("keeps a step that returned an expected failure completed, with the failure as its error", () => {
    const enrichment = run("trace", at(0), at(10_000), [
      toolStep("s1", "readWebPage"),
      toolStep("s2", "recordFinding"),
      toolStep("s3", "webSearch"),
      toolStep("s4", "findCompanyWebsite"),
    ]);
    const [detailed] = attachToolDetails(
      [enrichment],
      [
        message(
          "m1",
          at(1_000),
          call("c1", "readWebPage", { url: "https://acme.com" }, { ok: false, error: "robots.txt disallows this page" }),
          call(
            "c2",
            "recordFinding",
            { subject: "company", label: "size_band", value: "huge" },
            { ok: false, reason: "invalid_value", message: 'Use one of "1-10", "11-50"' },
          ),
          // Mastra's input validation failure, as the transcript summary
          // keeps it.
          call("c3", "webSearch", { query: 42 }, { error: true, message: VALIDATION_MESSAGE }),
          call("c4", "findCompanyWebsite", { name: "Quorvanta" }, { ok: false }),
        ),
      ],
    );
    assert.deepEqual(outcome(detailed), [
      ["Reading acme.com", "completed", "robots.txt disallows this page", null],
      ["Recording company size: huge", "completed", 'Use one of "1-10", "11-50"', null],
      ["webSearch", "completed", "Invalid input — query: Expected string, received number", null],
      ["Finding the website for Quorvanta", "completed", "The tool reported a failure", null],
    ]);
  });

  it("doesn't treat a successful result with an error-like field as a failure", () => {
    const enrichment = run("trace", at(0), at(10_000), [toolStep("s1", "webSearch")]);
    const [detailed] = attachToolDetails(
      [enrichment],
      [message("m1", at(1_000), call("c1", "webSearch", { query: "acme" }, { ok: true, error: "partial" }))],
    );
    assert.deepEqual(outcome(detailed), [
      ["Searching the web for acme", "completed", null, '{"ok":true,"error":"partial"}'],
    ]);
  });

  it("keeps an error saved with the call when the result arrives in a later entry", () => {
    const enrichment = run("trace", at(0), at(10_000), [toolStep("s1", "readWebPage")]);
    const [detailed] = attachToolDetails(
      [enrichment],
      [
        message("m1", at(1_000), failedCall("c1", "readWebPage", { url: "https://acme.com" }, "socket hang up")),
        message("m2", at(2_000), { ...call("c1", "readWebPage", undefined), state: "output-error" }),
      ],
    );
    assert.deepEqual(outcome(detailed), [["Reading acme.com", "failed", "socket hang up", null]]);
  });

  // Mastra leaves a call the run's abort cut off in `call`, with no
  // result or error.
  it("stops a step whose call never finished once its run has ended", () => {
    const steps = [
      withStatus(toolStep("s1", "webSearch"), "running"),
      withStatus(toolStep("s2", "readWebPage"), "running"),
    ];
    const ended = run("trace", at(0), at(10_000), steps);
    const [detailed] = attachToolDetails(
      [ended],
      [
        message(
          "m1",
          at(1_000),
          call("c1", "webSearch", { query: "acme" }),
          { ...call("c2", "readWebPage", { url: "https://acme.com" }), state: "partial-call" },
        ),
      ],
    );
    assert.deepEqual(outcome(detailed), [
      ["Searching the web for acme", "stopped", null, null],
      ["Reading acme.com", "stopped", null, null],
    ]);
  });

  it("keeps a step whose call hasn't finished running while its run is", () => {
    const going = run("trace", at(0), null, [withStatus(toolStep("s1", "webSearch"), "running")]);
    const [detailed] = attachToolDetails(
      [going],
      [message("m1", at(1_000), call("c1", "webSearch", { query: "acme" }))],
    );
    assert.equal(detailed.steps[0].status, "running");
  });

  it("trusts the span of an unfinished call that ended or failed", () => {
    // A parallel call can finish before the abort cuts its sibling off, and
    // its result is then never saved. A step left open in a failed run
    // failed with it.
    const failed = run(
      "trace",
      at(0),
      at(10_000),
      [toolStep("s1", "webSearch"), withStatus(toolStep("s2", "readWebPage"), "failed")],
      "failed",
    );
    const [detailed] = attachToolDetails(
      [failed],
      [
        message(
          "m1",
          at(1_000),
          call("c1", "webSearch", { query: "acme" }),
          call("c2", "readWebPage", { url: "https://acme.com" }),
        ),
      ],
    );
    assert.deepEqual(statuses(detailed), [
      ["s1", "completed"],
      ["s2", "failed"],
    ]);
  });

  it("stops a tool call left open in a completed run, from the synced spans and messages", () => {
    const spans = [
      rootSpan({ endedAt: at(10_000) }),
      childSpan("step-1", "model_step", "root", { startedAt: at(100), endedAt: at(9_000) }),
      toolSpan("search", "webSearch", "step-1", { startedAt: at(500), endedAt: at(2_000) }),
      toolSpan("fetch", "readWebPage", "step-1", { startedAt: at(600) }),
    ];
    const built = buildRuns(spans, lead("ready"), NOW);
    assert.deepEqual(statuses(built[0]), [
      ["step-1", "completed"],
      ["search", "completed"],
      ["fetch", "running"],
    ]);
    const [detailed] = attachToolDetails(built, [
      message(
        "m1",
        at(1_000),
        call("c1", "webSearch", { query: "acme" }, { ok: true, count: 3 }),
        call("c2", "readWebPage", { url: "https://acme.com" }),
      ),
    ]);
    assert.deepEqual(statuses(detailed), [
      ["step-1", "completed"],
      ["search", "completed"],
      ["fetch", "stopped"],
    ]);
  });

  // Parallel calls of one tool start in the same millisecond, so start
  // order can't tell their steps apart. The span's tool call ID can.
  it("gives each tool span its own call by toolCallId, whatever order the spans sync in", () => {
    const record = (spanId: string, toolCallId: string, fields: Partial<MastraSpan> = {}): SyncedSpan => ({
      ...toolSpan(spanId, "recordFinding", "step-1", { startedAt: at(500), endedAt: at(800), ...fields }),
      toolCallId,
    });
    const spans: SyncedSpan[] = [
      { ...rootSpan({ endedAt: at(10_000) }), toolCallId: null },
      { ...childSpan("step-1", "model_step", "root", { startedAt: at(100), endedAt: at(9_000) }), toolCallId: null },
      // Call order is c1, c2, c3; span-ID order is "aa" (c2), "mm" (c3), "zz" (c1).
      record("zz", "c1"),
      record("aa", "c2", { error: { name: "Error", message: "connection terminated" } }),
      record("mm", "c3"),
    ];
    const args = (label: string, value: string) => ({ subject: "company", label, value, confidence: 0.9 });
    const messages = [
      message(
        "m1",
        at(1_000),
        call("c1", "recordFinding", args("industry", "Email infrastructure"), { ok: true }),
        failedCall("c2", "recordFinding", args("size_band", "11-50"), "connection terminated"),
        call("c3", "recordFinding", args("hq_location", "San Francisco"), { ok: true }),
      ),
    ];
    const [detailed] = attachToolDetails(buildRuns(spans, lead("ready"), NOW), messages, spans);
    assert.deepEqual(
      detailed.steps.map((step) => [step.spanId, step.label, step.status]),
      [
        ["step-1", "Model call", "completed"],
        ["aa", "Recording company size: 11-50", "failed"],
        ["mm", "Recorded HQ location: San Francisco", "completed"],
        ["zz", "Recorded industry: Email infrastructure", "completed"],
      ],
    );
  });

  it("doesn't give a span without a toolCallId a call that another span names", () => {
    const spans: SyncedSpan[] = [
      { ...rootSpan({ endedAt: at(10_000) }), toolCallId: null },
      // The attribute is missing, so the projection is null.
      { ...toolSpan("first", "webSearch", "root", { startedAt: at(100), endedAt: at(900) }), toolCallId: null },
      { ...toolSpan("second", "webSearch", "root", { startedAt: at(100), endedAt: at(900) }), toolCallId: "c1" },
    ];
    const [detailed] = attachToolDetails(
      buildRuns(spans, lead("ready"), NOW),
      [
        message(
          "m1",
          at(1_000),
          call("c1", "webSearch", { query: "named" }, { ok: true }),
          call("c2", "webSearch", { query: "unnamed" }, { ok: true }),
        ),
      ],
      spans,
    );
    assert.deepEqual(
      detailed.steps.map((step) => [step.spanId, step.inputSummary]),
      [
        ["first", '{"query":"unnamed"}'],
        ["second", '{"query":"named"}'],
      ],
    );
  });

  it("leaves a span whose call isn't saved yet without details, rather than taking another call", () => {
    const spans: SyncedSpan[] = [
      { ...rootSpan(), toolCallId: null },
      { ...toolSpan("a", "webSearch", "root", { startedAt: at(100) }), toolCallId: "c1" },
      { ...toolSpan("b", "webSearch", "root", { startedAt: at(100) }), toolCallId: "c2" },
    ];
    const [detailed] = attachToolDetails(
      buildRuns(spans, lead("enriching"), NOW),
      [message("m1", at(1_000), call("c2", "webSearch", { query: "second" }))],
      spans,
    );
    assert.deepEqual(
      detailed.steps.map((step) => [step.spanId, step.inputSummary]),
      [
        ["a", null],
        ["b", '{"query":"second"}'],
      ],
    );
  });

  it("shows no input line for a tool that takes none", () => {
    const enrichment = run("trace", at(0), at(10_000), [toolStep("s1", "lookupGravatar")]);
    const [detailed] = attachToolDetails(
      [enrichment],
      [message("m1", at(1_000), call("c1", "lookupGravatar", {}, { ok: true }))],
    );
    assert.deepEqual(details(detailed), [["lookupGravatar", null, '{"ok":true}']]);
    assert.equal(detailed.steps[0].label, "Checking Gravatar");
  });

  it("shows a validation failure the transcript clipped as its issues", () => {
    const enrichment = run("trace", at(0), at(10_000), [toolStep("s1", "recordFinding")]);
    const clipped =
      "Tool input validation failed for recordFinding. Please fix the following errors and try again:\n" +
      "- label: Invalid enum val…";
    const [detailed] = attachToolDetails(
      [enrichment],
      [message("m1", at(1_000), call("c1", "recordFinding", { subject: "person" }, { error: true, message: clipped }))],
    );
    assert.deepEqual(outcome(detailed), [
      ["recordFinding", "completed", "Invalid input — label: Invalid enum val…", null],
    ]);
  });
});

describe("currentStep", () => {
  const running = (step: RunStep): RunStep => ({ ...step, status: "running" });

  it("returns nothing when no step is running", () => {
    const finished = run("trace", at(0), at(5_000), [modelStep("m1"), toolStep("s1", "webSearch")]);
    assert.equal(currentStep(finished), undefined);
  });

  it("returns the tool call running inside the running model step", () => {
    const search = running(toolStep("s1", "webSearch"));
    const current = run("trace", at(0), null, [modelStep("m1"), running(modelStep("m2")), search]);
    assert.equal(currentStep(current), search);
  });

  it("skips steps after it that have already finished", () => {
    const search = running(toolStep("s1", "webSearch"));
    const current = run("trace", at(0), null, [running(modelStep("m1")), search, toolStep("s2", "lookupCompany")]);
    assert.equal(currentStep(current), search);
  });
});

describe("currentActivity", () => {
  const running = (step: RunStep): RunStep => ({ ...step, status: "running" });

  it("names a running tool step by what its tool does", () => {
    const current = run("trace", at(0), null, [running(modelStep("m1")), running(toolStep("s1", "webSearch"))]);
    const step = currentActivity(current);
    assert.equal(step?.label, "Searching the web");
    assert.equal(step?.spanId, "s1");
  });

  it("reads the tool's name out of a span name", () => {
    const current = run("trace", at(0), null, [running(toolStep("s1", "tool: 'recordFinding'"))]);
    assert.equal(currentActivity(current)?.label, "Recording a finding");
  });

  it("keeps the label of a model step or an unknown tool", () => {
    const model = running(modelStep("m1"));
    assert.equal(currentActivity(run("trace", at(0), null, [model])), model);
    const unknown = running(toolStep("s1", "lookupCompany"));
    assert.equal(currentActivity(run("trace", at(0), null, [unknown])), unknown);
  });

  it("returns nothing when no step is running", () => {
    assert.equal(currentActivity(run("trace", at(0), at(5_000), [toolStep("s1", "webSearch")])), undefined);
  });
});
