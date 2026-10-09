import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ToolsInput } from "@mastra/core/agent";
import { createTool, type ToolPayloadTransformContext } from "@mastra/core/tools";
import { z } from "zod";

import {
  RUN_LIMITS,
  RunBudget,
  TRANSCRIPT_LIMITS,
  enrichmentTool,
  fitToBytes,
  summarizeToolOutput,
  toolTranscript,
  type CountedKind,
  type EnrichmentTool,
} from "~/server/enrichment/budget";

function budget(signal: AbortSignal = new AbortController().signal) {
  return new RunBudget(signal);
}

function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}

describe("RUN_LIMITS", () => {
  it("holds the run budget, with the 4 KB result cap", () => {
    assert.equal(RUN_LIMITS.maxSteps, 30);
    assert.equal(RUN_LIMITS.maxCostUsd, 0.5);
    assert.equal(RUN_LIMITS.toolResultBytes, 4_000);
    assert.deepEqual(RUN_LIMITS.calls, { search: 6, read: 12, image: 12, lookup: 12, x: 4, colleague: 6 });
  });
});

describe("RunBudget.take", () => {
  it("grants each counted kind up to its limit, then returns a message", () => {
    const run = budget();
    for (const kind of Object.keys(RUN_LIMITS.calls) as CountedKind[]) {
      const limit = RUN_LIMITS.calls[kind];
      for (let i = 0; i < limit; i++) assert.equal(run.take(kind), null, `${kind} call ${i + 1}`);
      assert.equal(run.used(kind), limit);
      const message = run.take(kind);
      assert.ok(message, `${kind} is spent`);
      assert.match(message, new RegExp(String(limit)));
      // A refused call isn't counted.
      assert.equal(run.used(kind), limit);
    }
  });

  it("counts kinds separately", () => {
    const run = budget();
    for (let i = 0; i < RUN_LIMITS.calls.search; i++) run.take("search");
    assert.ok(run.take("search"));
    assert.equal(run.take("read"), null);
    assert.equal(run.used("read"), 1);
    assert.equal(run.used("lookup"), 0);
  });

  it("says what to do when spent", () => {
    const run = budget();
    for (let i = 0; i < RUN_LIMITS.calls.x; i++) run.take("x");
    assert.match(run.take("x") ?? "", /^X lookup budget spent \(4 lookups\)/);
    for (let i = 0; i < RUN_LIMITS.calls.colleague; i++) run.take("colleague");
    assert.match(run.take("colleague") ?? "", /Don't record more colleagues/);
  });

  it("always grants free calls", () => {
    const run = budget();
    for (let i = 0; i < 100; i++) assert.equal(run.take("free"), null);
  });

  it("honours custom limits", () => {
    const run = new RunBudget(new AbortController().signal, {
      ...RUN_LIMITS,
      calls: { ...RUN_LIMITS.calls, search: 1 },
    });
    assert.equal(run.take("search"), null);
    assert.match(run.take("search") ?? "", /1 searches/);
  });
});

describe("RunBudget cost", () => {
  it("accumulates cost by source", () => {
    const run = budget();
    run.addCost("model", 0.1);
    run.addCost("exa", 0.005);
    run.addCost("exa", 0.005);
    assert.ok(Math.abs(run.costUsd - 0.11) < 1e-12);
    assert.deepEqual(Object.keys(run.costBySource()).sort(), ["exa", "model"]);
    assert.ok(Math.abs((run.costBySource().exa ?? 0) - 0.01) < 1e-12);
    assert.equal(run.costSpent, false);
  });

  it("ignores amounts that aren't finite and positive", () => {
    const run = budget();
    run.addCost("x", Number.NaN);
    run.addCost("x", -1);
    run.addCost("x", Number.POSITIVE_INFINITY);
    run.addCost("x", 0);
    assert.equal(run.costUsd, 0);
    assert.deepEqual(run.costBySource(), {});
  });

  it("is spent at the cap, and then refuses every counted kind", () => {
    const run = budget();
    run.addCost("model", 0.3);
    assert.equal(run.costSpent, false);
    run.addCost("model", 0.2);
    assert.equal(run.costSpent, true);
    assert.match(run.take("read") ?? "", /Cost budget spent \(\$0\.50\)/);
    assert.equal(run.used("read"), 0);
    assert.equal(run.take("free"), null);
  });

  it("returns a copy of the costs", () => {
    const run = budget();
    run.addCost("exa", 0.01);
    const costs = run.costBySource() as Record<string, number>;
    costs.exa = 99;
    assert.equal(run.costBySource().exa, 0.01);
  });

  it("measures elapsed time from construction", () => {
    const run = budget();
    assert.ok(run.startedAt <= Date.now());
    assert.ok(run.elapsedMs() >= 0);
  });
});

describe("fitToBytes", () => {
  it("returns a small value unchanged", () => {
    const value = { ok: true, title: "Acme", tags: ["a", "b"], n: 3 };
    assert.deepEqual(fitToBytes(value, 4_000), value);
  });

  it("returns a JSON copy, as the model receives it", () => {
    const value = { at: new Date("2026-01-01T00:00:00Z"), gone: undefined };
    assert.deepEqual(fitToBytes(value, 4_000), { at: "2026-01-01T00:00:00.000Z" });
    assert.equal(fitToBytes(undefined, 4_000), undefined);
  });

  it("shortens the longest string first", () => {
    const value = { title: "Acme", text: "x".repeat(10_000) };
    const fitted = fitToBytes(value, 4_000) as { title: string; text: string };
    assert.ok(bytes(fitted) <= 4_000);
    assert.equal(fitted.title, "Acme");
    assert.ok(fitted.text.endsWith("…[truncated]"));
    assert.ok(fitted.text.length > 3_000, "keeps as much as fits");
  });

  it("shortens several strings until it fits", () => {
    const value = { results: Array.from({ length: 30 }, (_, i) => ({ url: `https://e.com/${i}`, snippet: "s".repeat(400) })) };
    const fitted = fitToBytes(value, 4_000) as typeof value;
    assert.ok(bytes(fitted) <= 4_000);
    assert.equal(fitted.results.length, 30);
    assert.equal(fitted.results[0]!.url, "https://e.com/0");
  });

  it("drops trailing array items when strings are already short", () => {
    const value = { names: Array.from({ length: 2_000 }, (_, i) => `name-${i}`) };
    const fitted = fitToBytes(value, 4_000) as typeof value;
    assert.ok(bytes(fitted) <= 4_000);
    assert.equal(fitted.names[0], "name-0");
    assert.ok(fitted.names.length < 2_000);
  });

  it("counts bytes, not characters", () => {
    const value = { text: "é".repeat(5_000) };
    const fitted = fitToBytes(value, 4_000);
    assert.ok(bytes(fitted) <= 4_000);
  });

  it("never splits a surrogate pair", () => {
    const fitted = fitToBytes({ text: "😀".repeat(3_000) }, 4_000) as { text: string };
    assert.ok(bytes(fitted) <= 4_000);
    assert.doesNotMatch(fitted.text, /[\ud800-\udbff](?![\udc00-\udfff])/);
  });

  it("falls back to a JSON prefix whose wrapper still fits", () => {
    // Many keys, each with a short value: nothing to shorten or drop.
    const value = Object.fromEntries(Array.from({ length: 1_000 }, (_, i) => [`"key"-${i}`, "\"v\""]));
    const fitted = fitToBytes(value, 4_000) as { truncated: boolean; json: string };
    assert.equal(fitted.truncated, true);
    assert.ok(bytes(fitted) <= 4_000, `wrapper is ${bytes(fitted)} bytes`);
    assert.ok(fitted.json.startsWith("{"));
  });
});

describe("enrichmentTool", () => {
  const schema = z.object({ query: z.string() });

  function probe(run: RunBudget, execute: (input: { query: string }) => Promise<unknown>, kind: "search" | "free" = "search") {
    return enrichmentTool(run, { id: "probe", description: "A test tool.", inputSchema: schema, kind, execute });
  }

  async function call(tool: EnrichmentTool, input: unknown): Promise<unknown> {
    assert.ok(tool.execute);
    return (tool.execute as (input: unknown, context: unknown) => Promise<unknown>)(input, {});
  }

  it("is a Mastra tool an agent accepts", () => {
    const tool = probe(budget(), async () => ({}));
    const tools: ToolsInput = { probe: tool };
    assert.equal(tools.probe, tool);
    assert.equal(tool.id, "probe");
  });

  it("runs the spec with the input and the budget", async () => {
    const run = budget();
    let seen: unknown;
    const tool = enrichmentTool(run, {
      id: "probe",
      description: "A test tool.",
      inputSchema: schema,
      kind: "search",
      execute: async (input, given) => {
        seen = given;
        return { ok: true, echo: input.query };
      },
    });
    assert.deepEqual(await call(tool, { query: "acme" }), { ok: true, echo: "acme" });
    assert.equal(seen, run);
    assert.equal(run.used("search"), 1);
  });

  it("returns { ok: false } without running when the kind is spent", async () => {
    const run = budget();
    for (let i = 0; i < RUN_LIMITS.calls.search; i++) run.take("search");
    let ran = false;
    const result = await call(
      probe(run, async () => {
        ran = true;
        return {};
      }),
      { query: "acme" },
    );
    assert.deepEqual(result, { ok: false, error: "Search budget spent (6 searches). Record what you have and finish." });
    assert.equal(ran, false);
  });

  it("turns a thrown error into { ok: false, error }", async () => {
    const result = await call(
      probe(budget(), async () => {
        throw new Error("HTTP 503 from example.com");
      }),
      { query: "acme" },
    );
    assert.deepEqual(result, { ok: false, error: "HTTP 503 from example.com" });
  });

  it("treats a timeout as an expected failure", async () => {
    const result = (await call(
      probe(budget(), async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }),
      { query: "acme" },
    )) as { ok: boolean };
    assert.equal(result.ok, false);
  });

  it("fits the result to the byte cap", async () => {
    const result = await call(
      probe(budget(), async () => ({ text: "x".repeat(20_000) })),
      { query: "acme" },
    );
    assert.ok(bytes(result) <= RUN_LIMITS.toolResultBytes);
  });

  it("throws when the run is already aborted, without charging", async () => {
    const controller = new AbortController();
    controller.abort();
    const run = budget(controller.signal);
    await assert.rejects(call(probe(run, async () => ({})), { query: "acme" }), { name: "AbortError" });
    assert.equal(run.used("search"), 0);
  });

  it("propagates an abort during the call", async () => {
    const controller = new AbortController();
    const run = budget(controller.signal);
    const tool = probe(run, async () => {
      controller.abort();
      throw new Error("socket hang up");
    });
    await assert.rejects(call(tool, { query: "acme" }), /socket hang up/);
  });

  it("propagates an AbortError even from another signal", async () => {
    const tool = probe(budget(), async () => {
      throw new DOMException("This operation was aborted", "AbortError");
    });
    await assert.rejects(call(tool, { query: "acme" }), { name: "AbortError" });
  });

  it("throws when the run aborts while a result is on its way", async () => {
    const controller = new AbortController();
    const tool = probe(budget(controller.signal), async () => {
      controller.abort();
      return { ok: true };
    });
    await assert.rejects(call(tool, { query: "acme" }), { name: "AbortError" });
  });

  it("stores a transcript summary for all three phases", () => {
    const transcript = probe(budget(), async () => ({})).transform?.transcript;
    assert.equal(typeof transcript?.input, "function");
    assert.equal(typeof transcript?.output, "function");
    assert.equal(typeof transcript?.error, "function");
  });
});

// The context Mastra passes a transcript transform, for the phase under test.
function phase(fields: Partial<ToolPayloadTransformContext>): ToolPayloadTransformContext {
  return { target: "transcript", phase: "output-available", toolName: "probe", toolCallId: "c1", ...fields };
}

describe("toolTranscript", () => {
  const { transcript } = toolTranscript();

  it("holds the transcript limits", () => {
    assert.deepEqual(TRANSCRIPT_LIMITS, { argChars: 120, outputBytes: 160, errorChars: 300 });
  });

  it("keeps the args, with every string clipped, so labels still work", () => {
    const input = {
      url: "https://resend.com/about",
      note: "n".repeat(500),
      confidence: 0.9,
      tags: ["t".repeat(200), "short"],
      nested: { value: "v".repeat(200), keep: true },
    };
    const stored = transcript.input(phase({ phase: "input-available", input })) as typeof input;
    assert.equal(stored.url, input.url);
    assert.equal(stored.confidence, 0.9);
    assert.equal(stored.note.length, TRANSCRIPT_LIMITS.argChars);
    assert.ok(stored.note.endsWith("…"));
    assert.equal(stored.tags[0]!.length, TRANSCRIPT_LIMITS.argChars);
    assert.equal(stored.tags[1], "short");
    assert.equal(stored.nested.value.length, TRANSCRIPT_LIMITS.argChars);
    assert.equal(stored.nested.keep, true);
    // The model's input is left alone.
    assert.equal(input.note.length, 500);
  });

  it("never returns undefined, which Mastra would store as a placeholder", () => {
    assert.deepEqual(transcript.input(phase({ phase: "input-available" })), {});
    assert.deepEqual(transcript.output(phase({})), {});
    assert.equal(transcript.error(phase({ phase: "error" })), "Tool execution failed");
  });

  it("stores the output as its summary", () => {
    const output = { ok: true, url: "https://resend.com/about", text: "x".repeat(4_000), images: [1, 2, 3] };
    assert.deepEqual(transcript.output(phase({ output })), summarizeToolOutput(output));
  });

  it("stores the error as a clipped string", () => {
    const error = (value: unknown) => transcript.error(phase({ phase: "error", error: value }));
    assert.equal(error(new Error("relation \"findings\" does not exist")), 'relation "findings" does not exist');
    assert.equal(error("HTTP 503"), "HTTP 503");
    assert.equal(error({ message: "from a plain object" }), "from a plain object");
    assert.equal(error(new Error("")), "Tool execution failed");
    const long = error(new Error("e".repeat(1_000))) as string;
    assert.equal(long.length, TRANSCRIPT_LIMITS.errorChars);
    assert.ok(long.endsWith("…"));
  });

  it("fits createTool's transform for a typed tool, as the record tools use it", () => {
    const tool = createTool({
      id: "recordProbe",
      description: "A typed test tool.",
      inputSchema: z.object({ label: z.string(), confidence: z.number() }),
      outputSchema: z.object({ ok: z.boolean() }),
      transform: toolTranscript(),
      execute: async () => ({ ok: true }),
    });
    const tools: ToolsInput = { recordProbe: tool };
    assert.equal(tools.recordProbe, tool);
  });
});

describe("summarizeToolOutput", () => {
  const max = TRANSCRIPT_LIMITS.outputBytes;

  it("keeps ok and the error of a tool failure", () => {
    assert.deepEqual(summarizeToolOutput({ ok: false, error: "robots.txt disallows https://a.example/x" }), {
      ok: false,
      error: "robots.txt disallows https://a.example/x",
    });
  });

  it("clips a long error to fit", () => {
    const summary = summarizeToolOutput({ ok: false, error: "Exa search failed: ".concat("z".repeat(500)) });
    assert.equal(summary.ok, false);
    assert.match(summary.error as string, /^Exa search failed: z+…$/);
    assert.ok(bytes(summary) <= max, `${bytes(summary)} bytes`);
  });

  it("clips by bytes, counting escapes and multi-byte characters", () => {
    for (const error of ["é".repeat(400), '"\\'.repeat(200), "😀".repeat(200), "line\n".repeat(100)]) {
      const summary = summarizeToolOutput({ ok: false, error });
      assert.ok(bytes(summary) <= max, `${bytes(summary)} bytes`);
      assert.ok((summary.error as string).length > 10);
    }
  });

  it("keeps a validation failure's error and message", () => {
    const summary = summarizeToolOutput({
      error: true,
      message: "Tool input validation failed for webSearch. Please fix the following errors and try again:\n- query: Too small",
      validationErrors: { query: { _errors: ["Too small"] } },
    });
    assert.equal(summary.error, true);
    assert.match(summary.message as string, /^Tool input validation failed for webSearch/);
    assert.equal("validationErrors" in summary, false);
    assert.ok(bytes(summary) <= max);
  });

  it("keeps a few short scalars, url, domain and count first, and stores arrays as their length", () => {
    assert.deepEqual(
      summarizeToolOutput({
        ok: true,
        status: 200,
        title: "About Resend",
        text: "x".repeat(4_000),
        links: ["a", "b"],
        images: [{ url: "https://resend.com/a.png" }],
        url: "https://resend.com/about",
      }),
      { ok: true, url: "https://resend.com/about", status: 200, title: "About Resend", links: 2 },
    );
    assert.deepEqual(summarizeToolOutput({ ok: true, results: [1, 2, 3, 4, 5], excluded: 2 }), { ok: true, results: 5, excluded: 2 });
    assert.deepEqual(
      summarizeToolOutput({ ok: true, match: { domain: "resend.com" }, domain: "resend.com", resolves: true, mx: null }),
      { ok: true, domain: "resend.com", resolves: true },
    );
  });

  it("stays within the byte cap however big the output is", () => {
    const output = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`field${i}`, "v".repeat(90)]));
    const summary = summarizeToolOutput({ ok: true, ...output });
    assert.equal(summary.ok, true);
    assert.ok(bytes(summary) <= max, `${bytes(summary)} bytes`);
    // A fitToBytes fallback wrapper keeps only its flag.
    assert.deepEqual(summarizeToolOutput(fitToBytes(Object.fromEntries(Array.from({ length: 1_000 }, (_, i) => [`k${i}`, "v"])), 4_000)), {
      truncated: true,
    });
  });

  it("summarizes outputs that aren't objects", () => {
    assert.deepEqual(summarizeToolOutput(undefined), {});
    assert.deepEqual(summarizeToolOutput(null), {});
    assert.deepEqual(summarizeToolOutput([1, 2, 3]), { count: 3 });
    assert.deepEqual(summarizeToolOutput(true), { value: true });
    assert.deepEqual(summarizeToolOutput(42), { value: 42 });
    const text = summarizeToolOutput("t".repeat(1_000));
    assert.ok(bytes(text) <= max);
    assert.match(text.value as string, /^t+…$/);
  });
});
