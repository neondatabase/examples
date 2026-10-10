import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import type { LeadRef } from "~/lib/types";

import {
  createRunner,
  logDetail,
  settleWithin,
  type JobContext,
  type Runner,
  type RunnerOptions,
  type RunnerStages,
} from "./runner";

// The runner runs here with stub stages that stay pending until a test settles
// them. `setTimeout` is mocked, so the tests drive the restart debounce and the
// stage deadlines with `mock.timers.tick`, and `settle` lets the runner's
// promise chains catch up in between.

const OPTIONS: RunnerOptions = {
  restartDebounceMs: 100,
  extractionTimeoutMs: 1_000,
  enrichmentTimeoutMs: 5_000,
  maxConcurrentEnrichments: 2,
};

const LEAD_A: LeadRef = { leadId: "lead-a", workspaceId: "ws-1" };
const LEAD_B: LeadRef = { leadId: "lead-b", workspaceId: "ws-1" };
const LEAD_C: LeadRef = { leadId: "lead-c", workspaceId: "ws-1" };
const LEAD_D: LeadRef = { leadId: "lead-d", workspaceId: "ws-1" };

// One call of a stub stage.
interface StageCall<T> {
  readonly job: JobContext;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function stubStages(overrides: Partial<RunnerStages> = {}) {
  const extractions: StageCall<boolean>[] = [];
  const enrichments: StageCall<void>[] = [];
  const failures: { leadId: string; message: string }[] = [];
  const stages: RunnerStages = {
    runExtraction: (job) => new Promise((resolve, reject) => extractions.push({ job, resolve, reject })),
    runEnrichment: (job) => new Promise((resolve, reject) => enrichments.push({ job, resolve, reject })),
    markLeadFailed: async ({ leadId }, message) => {
      failures.push({ leadId, message });
    },
    failInterruptedLeads: async () => 0,
    ...overrides,
  };
  return { stages, extractions, enrichments, failures };
}

type Stub = ReturnType<typeof stubStages>;

// Lets pending promise callbacks run. Only `setTimeout` is mocked, so
// `setImmediate` still fires.
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// Rejects a stage call the way a real stage does once its signal aborts.
function giveUp(call: StageCall<unknown>): void {
  call.reject(call.job.signal.reason);
}

function leadIds(calls: readonly StageCall<unknown>[]): string[] {
  return calls.map((call) => call.job.leadId);
}

// Starts a lead and lets its extraction finish, so it moves on to enrichment.
async function startEnriching(runner: Runner, stub: Stub, ref: LeadRef): Promise<void> {
  runner.startLead(ref);
  await settle();
  stub.extractions.at(-1)?.resolve(true);
  await settle();
}

describe("createRunner", () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ["setTimeout"] });
    // The runner logs failures; keep the test output readable.
    mock.method(console, "error", () => {});
    mock.method(console, "info", () => {});
  });

  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  describe("ready", () => {
    it("resolves only after the startup sweep has marked interrupted leads failed", async () => {
      let finishSweep!: (count: number) => void;
      const stub = stubStages({ failInterruptedLeads: () => new Promise((resolve) => (finishSweep = resolve)) });
      const runner = createRunner(stub.stages, OPTIONS);
      let ready = false;
      void runner.ready.then(() => (ready = true));

      await settle();
      assert.equal(ready, false);
      finishSweep(2);
      await settle();
      assert.equal(ready, true);
    });

    it("holds a new job until the sweep finishes, so the sweep can't fail it", async () => {
      let finishSweep!: (count: number) => void;
      const stub = stubStages({ failInterruptedLeads: () => new Promise((resolve) => (finishSweep = resolve)) });
      const runner = createRunner(stub.stages, OPTIONS);

      runner.startLead(LEAD_A);
      await settle();
      assert.equal(stub.extractions.length, 0);
      finishSweep(0);
      await settle();
      assert.deepEqual(leadIds(stub.extractions), ["lead-a"]);
    });

    it("still resolves, and jobs still run, when the sweep fails", async () => {
      const stub = stubStages({
        failInterruptedLeads: async () => {
          throw new Error("database unavailable");
        },
      });
      const runner = createRunner(stub.stages, OPTIONS);

      await runner.ready;
      runner.startLead(LEAD_A);
      await settle();
      assert.deepEqual(leadIds(stub.extractions), ["lead-a"]);
    });
  });

  describe("startLead", () => {
    it("runs extraction, then enrichment for the same lead", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);

      runner.startLead(LEAD_A);
      await settle();
      const [extraction] = stub.extractions;
      assert.equal(extraction.job.leadId, "lead-a");
      assert.equal(extraction.job.workspaceId, "ws-1");
      assert.equal(stub.enrichments.length, 0);

      extraction.resolve(true);
      await settle();
      const [enrichment] = stub.enrichments;
      assert.equal(enrichment.job.leadId, "lead-a");
      assert.equal(enrichment.job.workspaceId, "ws-1");
    });

    it("stops after extraction when it says enrichment shouldn't follow", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);

      runner.startLead(LEAD_A);
      await settle();
      stub.extractions[0].resolve(false);
      await settle();
      assert.equal(stub.enrichments.length, 0);
      assert.deepEqual(stub.failures, []);
    });

    it("marks a lead failed, naming the stage and the error, when a stage throws", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);

      runner.startLead(LEAD_A);
      await startEnriching(runner, stub, LEAD_B);
      stub.extractions[0].reject(new Error("model\n  unavailable"));
      stub.enrichments[0].reject(new Error("search quota exceeded"));
      await settle();
      assert.deepEqual(stub.failures, [
        { leadId: "lead-a", message: "Extraction failed: model unavailable" },
        { leadId: "lead-b", message: "Enrichment failed: search quota exceeded" },
      ]);
    });

    it("marks a lead failed with \"Timed out\" when extraction overruns its deadline", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);

      runner.startLead(LEAD_A);
      await settle();
      const [extraction] = stub.extractions;
      mock.timers.tick(OPTIONS.extractionTimeoutMs - 1);
      assert.equal(extraction.job.signal.aborted, false);

      mock.timers.tick(1);
      assert.equal(extraction.job.signal.reason.name, "TimeoutError");
      giveUp(extraction);
      await settle();
      assert.deepEqual(stub.failures, [{ leadId: "lead-a", message: "Timed out" }]);
    });

    it("gives enrichment a fresh deadline of its own", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);

      await startEnriching(runner, stub, LEAD_A);
      const [enrichment] = stub.enrichments;
      mock.timers.tick(OPTIONS.extractionTimeoutMs);
      assert.equal(enrichment.job.signal.aborted, false);

      mock.timers.tick(OPTIONS.enrichmentTimeoutMs - OPTIONS.extractionTimeoutMs);
      assert.equal(enrichment.job.signal.reason.name, "TimeoutError");
      giveUp(enrichment);
      await settle();
      assert.deepEqual(stub.failures, [{ leadId: "lead-a", message: "Timed out" }]);
    });

    it("runs at most maxConcurrentEnrichments enrichments at once", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);

      for (const lead of [LEAD_A, LEAD_B, LEAD_C]) await startEnriching(runner, stub, lead);
      assert.deepEqual(leadIds(stub.enrichments), ["lead-a", "lead-b"]);
    });

    it("hands a freed slot to the next queued lead, whether the enrichment finished or failed", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);

      for (const lead of [LEAD_A, LEAD_B, LEAD_C, LEAD_D]) await startEnriching(runner, stub, lead);
      stub.enrichments[0].resolve();
      await settle();
      assert.deepEqual(leadIds(stub.enrichments), ["lead-a", "lead-b", "lead-c"]);

      stub.enrichments[1].reject(new Error("search quota exceeded"));
      await settle();
      assert.deepEqual(leadIds(stub.enrichments), ["lead-a", "lead-b", "lead-c", "lead-d"]);
      assert.deepEqual(
        stub.failures.map(({ leadId }) => leadId),
        ["lead-b"],
      );
    });

    it("logs a failure's message and HTTP status, never the error object", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);
      const providerError = Object.assign(new Error("Too Many Requests"), {
        statusCode: 429,
        url: "https://gateway.example/secret-path",
        requestBodyValues: { messages: ["the lead's raw input"] },
      });

      await startEnriching(runner, stub, LEAD_A);
      stub.enrichments[0].reject(new Error("429 REQUEST_LIMIT_EXCEEDED: Rate limit exceeded.", { cause: providerError }));
      await settle();
      const calls = (console.error as unknown as { mock: { calls: { arguments: unknown[] }[] } }).mock.calls;
      assert.deepEqual(calls.map((call) => call.arguments), [
        ["[runner] lead lead-a failed while enriching: Error: 429 REQUEST_LIMIT_EXCEEDED: Rate limit exceeded. (HTTP 429)"],
      ]);
    });

    it("doesn't make extraction wait for an enrichment slot", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);

      for (const lead of [LEAD_A, LEAD_B]) await startEnriching(runner, stub, lead);
      runner.startLead(LEAD_C);
      await settle();
      assert.deepEqual(leadIds(stub.extractions), ["lead-a", "lead-b", "lead-c"]);
    });
  });

  describe("restartEnrichment", () => {
    it("cancels the in-flight enrichment at once and reruns only enrichment after the debounce", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);
      await startEnriching(runner, stub, LEAD_A);
      const [cancelled] = stub.enrichments;

      runner.restartEnrichment(LEAD_A);
      assert.equal(cancelled.job.signal.reason.name, "AbortError");
      assert.equal(cancelled.job.signal.reason.message, "Cancelled");
      mock.timers.tick(OPTIONS.restartDebounceMs - 1);
      await settle();
      assert.equal(stub.enrichments.length, 1);

      mock.timers.tick(1);
      await settle();
      assert.deepEqual(leadIds(stub.enrichments), ["lead-a", "lead-a"]);
      assert.equal(stub.enrichments[1].job.signal.aborted, false);
      assert.equal(stub.extractions.length, 1);
    });

    it("coalesces a burst of edits into one restart, which reads the values after the last edit", async () => {
      const lead = { title: "Head of Sales" };
      const titlesSeen: string[] = [];
      const stub = stubStages();
      const runner = createRunner(
        {
          ...stub.stages,
          runEnrichment: (job) => {
            titlesSeen.push(lead.title);
            return stub.stages.runEnrichment(job);
          },
        },
        OPTIONS,
      );
      await startEnriching(runner, stub, LEAD_A);

      // Each edit pushes the restart back by a full debounce.
      for (const title of ["VP Sales", "VP of Sales", "VP Sales, EMEA"]) {
        lead.title = title;
        runner.restartEnrichment(LEAD_A);
        mock.timers.tick(OPTIONS.restartDebounceMs / 2);
      }
      await settle();
      assert.equal(stub.enrichments.length, 1);

      mock.timers.tick(OPTIONS.restartDebounceMs / 2);
      await settle();
      assert.equal(stub.enrichments.length, 2);
      assert.deepEqual(titlesSeen, ["Head of Sales", "VP Sales, EMEA"]);
    });

    it("restarts from extraction when edits land before extraction finished", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);
      runner.startLead(LEAD_A);
      await settle();

      runner.restartEnrichment(LEAD_A);
      mock.timers.tick(OPTIONS.restartDebounceMs / 2);
      runner.restartEnrichment(LEAD_A);
      mock.timers.tick(OPTIONS.restartDebounceMs);
      await settle();
      assert.equal(stub.extractions.length, 2);
      assert.equal(stub.extractions[0].job.signal.aborted, true);
      assert.equal(stub.enrichments.length, 0);
    });

    it("reruns only enrichment for a lead with no job, such as one whose enrichment failed", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);

      runner.restartEnrichment(LEAD_A);
      mock.timers.tick(OPTIONS.restartDebounceMs);
      await settle();
      assert.equal(stub.extractions.length, 0);
      assert.deepEqual(leadIds(stub.enrichments), ["lead-a"]);
    });

    it("restarts from extraction when the caller says the lead was never extracted, then enriches", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);

      runner.restartEnrichment(LEAD_A, { fromExtraction: true });
      mock.timers.tick(OPTIONS.restartDebounceMs);
      await settle();
      assert.deepEqual(leadIds(stub.extractions), ["lead-a"]);
      assert.equal(stub.enrichments.length, 0);

      stub.extractions[0].resolve(true);
      await settle();
      assert.deepEqual(leadIds(stub.enrichments), ["lead-a"]);
    });

    it("keeps a burst's restart at extraction when a later edit in it doesn't ask for that", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);

      runner.restartEnrichment(LEAD_A, { fromExtraction: true });
      mock.timers.tick(OPTIONS.restartDebounceMs / 2);
      runner.restartEnrichment(LEAD_A);
      mock.timers.tick(OPTIONS.restartDebounceMs / 2);
      await settle();
      assert.equal(stub.extractions.length, 0);

      mock.timers.tick(OPTIONS.restartDebounceMs / 2);
      await settle();
      assert.deepEqual(leadIds(stub.extractions), ["lead-a"]);
      assert.equal(stub.enrichments.length, 0);
    });

    it("cancels an in-flight enrichment and restarts from extraction when asked to", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);
      await startEnriching(runner, stub, LEAD_A);

      runner.restartEnrichment(LEAD_A, { fromExtraction: true });
      assert.equal(stub.enrichments[0].job.signal.aborted, true);
      mock.timers.tick(OPTIONS.restartDebounceMs);
      await settle();
      assert.equal(stub.extractions.length, 2);
      assert.equal(stub.extractions[1].job.signal.aborted, false);
      assert.equal(stub.enrichments.length, 1);
    });

    it("reports a failed re-extraction as an extraction failure", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);

      runner.restartEnrichment(LEAD_A, { fromExtraction: true });
      mock.timers.tick(OPTIONS.restartDebounceMs);
      await settle();
      stub.extractions[0].reject(new Error("Too Many Requests"));
      await settle();
      assert.deepEqual(stub.failures, [{ leadId: "lead-a", message: "Extraction failed: Too Many Requests" }]);
    });

    it("drops the follow-up of a stage that resolves after cancellation, without reporting a failure", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);
      runner.startLead(LEAD_A);
      await settle();

      runner.restartEnrichment(LEAD_A);
      stub.extractions[0].resolve(true);
      await settle();
      assert.equal(stub.enrichments.length, 0);
      assert.deepEqual(stub.failures, []);

      // Only the restarted job goes on to enrichment.
      mock.timers.tick(OPTIONS.restartDebounceMs);
      await settle();
      stub.extractions[1].resolve(true);
      await settle();
      assert.equal(stub.enrichments.length, 1);
      assert.equal(stub.enrichments[0].job.signal.aborted, false);
    });

    it("doesn't report a cancelled stage that rejects as it stops", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);
      await startEnriching(runner, stub, LEAD_A);

      runner.restartEnrichment(LEAD_A);
      giveUp(stub.enrichments[0]);
      await settle();
      assert.deepEqual(stub.failures, []);
    });
  });

  describe("cancel", () => {
    it("aborts the running stage with a cancel, not a timeout, and doesn't restart it", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);
      await startEnriching(runner, stub, LEAD_A);
      const [enrichment] = stub.enrichments;

      runner.cancel("lead-a");
      assert.equal(enrichment.job.signal.reason.name, "AbortError");
      giveUp(enrichment);
      mock.timers.tick(OPTIONS.enrichmentTimeoutMs);
      await settle();
      assert.deepEqual(stub.failures, []);
      assert.equal(stub.extractions.length, 1);
      assert.equal(stub.enrichments.length, 1);
    });

    it("drops a restart that an edit scheduled", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);
      await startEnriching(runner, stub, LEAD_A);

      runner.restartEnrichment(LEAD_A);
      runner.cancel("lead-a");
      mock.timers.tick(OPTIONS.restartDebounceMs);
      await settle();
      assert.equal(stub.enrichments.length, 1);
    });

    it("drops a restart from extraction, so archiving a lead in the debounce starts nothing", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);

      runner.restartEnrichment(LEAD_A, { fromExtraction: true });
      runner.cancel("lead-a");
      mock.timers.tick(OPTIONS.restartDebounceMs);
      await settle();
      assert.equal(stub.extractions.length, 0);
      assert.equal(stub.enrichments.length, 0);
    });

    it("skips a lead cancelled while it waited for an enrichment slot", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);
      for (const lead of [LEAD_A, LEAD_B, LEAD_C, LEAD_D]) await startEnriching(runner, stub, lead);

      runner.cancel("lead-c");
      stub.enrichments[0].resolve();
      await settle();
      assert.deepEqual(leadIds(stub.enrichments), ["lead-a", "lead-b", "lead-d"]);
      assert.deepEqual(stub.failures, []);
    });

    it("resolves at once for a lead with no job", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);
      let done = false;
      void runner.cancel("lead-a").then(() => (done = true));
      await settle();
      assert.equal(done, true);
    });

    it("resolves only once the cancelled stage has settled", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);
      await startEnriching(runner, stub, LEAD_A);

      let done = false;
      void runner.cancel("lead-a").then(() => (done = true));
      await settle();
      assert.equal(done, false);
      giveUp(stub.enrichments[0]);
      await settle();
      assert.equal(done, true);
      assert.deepEqual(stub.failures, []);
    });

    it("also waits for a job an edit cancelled that is still settling", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);
      await startEnriching(runner, stub, LEAD_A);

      // The edit aborts the job and schedules a restart; the delete lands in
      // the debounce, while the aborted job is still winding down.
      runner.restartEnrichment(LEAD_A);
      let done = false;
      void runner.cancel("lead-a").then(() => (done = true));
      await settle();
      assert.equal(done, false);
      stub.enrichments[0].resolve();
      await settle();
      assert.equal(done, true);
      mock.timers.tick(OPTIONS.restartDebounceMs);
      await settle();
      assert.equal(stub.enrichments.length, 1);
    });

    it("resolves for a queued lead without waiting for a slot", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);
      for (const lead of [LEAD_A, LEAD_B, LEAD_C]) await startEnriching(runner, stub, lead);

      let done = false;
      void runner.cancel("lead-c").then(() => (done = true));
      await settle();
      assert.equal(done, true);
      // The queue moved on without it.
      stub.enrichments[0].resolve();
      await startEnriching(runner, stub, LEAD_D);
      await settle();
      assert.deepEqual(leadIds(stub.enrichments), ["lead-a", "lead-b", "lead-d"]);
    });

    it("still reaches a restarted job after the cancelled one settles late", async () => {
      const stub = stubStages();
      const runner = createRunner(stub.stages, OPTIONS);
      await startEnriching(runner, stub, LEAD_A);

      runner.restartEnrichment(LEAD_A);
      mock.timers.tick(OPTIONS.restartDebounceMs);
      await settle();
      giveUp(stub.enrichments[0]);
      await settle();

      runner.cancel("lead-a");
      assert.equal(stub.enrichments[1].job.signal.aborted, true);
    });
  });

  describe("settleWithin", () => {
    it("is true when the promise settles in time, resolved or rejected", async () => {
      assert.equal(await settleWithin(Promise.resolve(), 1_000), true);
      assert.equal(await settleWithin(Promise.reject(new Error("stopped")), 1_000), true);
    });

    it("is false once the bound passes", async () => {
      let result: boolean | undefined;
      void settleWithin(new Promise(() => {}), 5_000).then((value) => (result = value));
      mock.timers.tick(4_999);
      await settle();
      assert.equal(result, undefined);
      mock.timers.tick(1);
      await settle();
      assert.equal(result, false);
    });
  });

  describe("logDetail", () => {
    it("names a plain value, and takes the status from the error itself", () => {
      assert.equal(logDetail("boom"), "boom");
      assert.equal(logDetail(Object.assign(new Error("Bad Gateway"), { statusCode: 502 })), "Error: Bad Gateway (HTTP 502)");
      assert.equal(logDetail(new TypeError("fetch failed")), "TypeError: fetch failed");
    });
  });
});
