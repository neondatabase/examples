import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it, mock } from "node:test";

import type { EnrichmentContext } from "~/lib/types";

// `enrichLead` on the app's real Mastra, agent, prompt and tools, with a mock
// model and an in-memory store: no database, no network and no model calls.
// The mock model only calls `recordFinding` with a label that doesn't match
// its subject, which the tool refuses before it reaches persistence.

type EnrichmentModule = typeof import("./enrichment.server");
type MastraModule = typeof import("./mastra.server");

let enrichment: EnrichmentModule;
let mastra: MastraModule;

before(async () => {
  // `db.server.ts` needs a URL to build its pool, which never connects here.
  process.env.DATABASE_URL ??= "postgres://livebase:livebase@127.0.0.1:1/livebase";
  const { InMemoryStore } = await import("@mastra/core/storage");
  // `getStore()` and `getMemory()` use the cached store.
  (globalThis as typeof globalThis & { livebaseMastraStore?: unknown }).livebaseMastraStore = new InMemoryStore();
  enrichment = await import("./enrichment.server");
  mastra = await import("./mastra.server");
});

after(async () => {
  await mastra.getMastra().shutdown();
});

// One model call as the mock saw it.
interface ModelCall {
  readonly tools: string[];
  readonly toolChoice: string | undefined;
  readonly system: string;
}

interface Reply {
  readonly toolCall?: boolean;
  readonly inputTokens?: number;
  readonly fail?: Error;
}

const REFUSED_CALL = { subject: "person", label: "domain", value: "acme.com", confidence: 1 };

// A V2 language model that follows `script` (the last entry repeats) and
// records what each call was given. It calls a tool only when it has some.
function useMockModel(script: readonly Reply[]): ModelCall[] {
  const calls: ModelCall[] = [];
  const model = {
    specificationVersion: "v2",
    provider: "mock",
    modelId: "mock-model",
    supportedUrls: {},
    async doGenerate(options: {
      tools?: { name: string }[];
      toolChoice?: { type: string };
      prompt: { role: string; content: unknown }[];
    }) {
      const reply = script[Math.min(calls.length, script.length - 1)];
      calls.push({
        tools: (options.tools ?? []).map((tool) => tool.name),
        toolChoice: options.toolChoice?.type,
        system: options.prompt.filter((message) => message.role === "system").map((message) => String(message.content)).join("\n"),
      });
      if (reply.fail) throw reply.fail;
      const usage = { inputTokens: reply.inputTokens ?? 1_000, outputTokens: 10, totalTokens: 0 };
      if (reply.toolCall && (options.tools ?? []).length > 0) {
        return {
          content: [{ type: "tool-call", toolCallId: `call-${calls.length}`, toolName: "recordFinding", input: JSON.stringify(REFUSED_CALL) }],
          finishReason: "tool-calls",
          usage,
          warnings: [],
        };
      }
      return { content: [{ type: "text", text: "Summary." }], finishReason: "stop", usage, warnings: [] };
    },
    async doStream() {
      throw new Error("not used");
    },
  };
  (enrichment.enrichmentAgent as unknown as { __updateModel(config: { model: unknown }): void }).__updateModel({ model });
  return calls;
}

let leadNumber = 0;

function context(signal = new AbortController().signal): EnrichmentContext {
  leadNumber += 1;
  const leadId = `00000000-0000-4000-8000-${String(leadNumber).padStart(12, "0")}`;
  return {
    leadId,
    workspaceId: "ws-1",
    signal,
    rawText: "Met Jane Doe from Acme at a meetup.",
    lead: { id: leadId, title: "Acme — intro", summary: null, value: null, fitScore: null, nextStep: null } as unknown as EnrichmentContext["lead"],
    person: null,
    company: null,
    colleagues: [],
  };
}

function runLines(): string[] {
  const info = console.info as unknown as { mock: { calls: { arguments: unknown[] }[] } };
  return info.mock.calls.map((call) => String(call.arguments[0])).filter((line) => line.startsWith("[enrichment] lead"));
}

describe("enrichLead", () => {
  beforeEach(() => {
    mock.restoreAll();
    mock.method(console, "info", () => {});
  });

  it("wraps up on the second-to-last step with only recordFinding, then stops tools", async () => {
    const calls = useMockModel([{ toolCall: true }]);
    await enrichment.enrichLead(context());

    assert.equal(calls.length, 30);
    const [wrapUp, last] = calls.slice(-2);
    assert.ok(calls[0].tools.length > 2);
    assert.ok(!calls[27].system.includes(enrichment.WRAP_UP_NOTE));
    assert.deepEqual(wrapUp.tools, ["recordFinding"]);
    assert.ok(wrapUp.system.includes(enrichment.WRAP_UP_NOTE));
    // The agent's own instructions are kept.
    assert.ok(wrapUp.system.includes("Logos"));
    assert.equal(last.toolChoice, "none");
    assert.match(runLines()[0], / stop in .* 30 steps/);
  });

  it("wraps up once the cost cap is reached, and doesn't store the note", async () => {
    // $2 per million input tokens: 300k tokens is $0.60, over the $0.50 cap.
    const calls = useMockModel([{ toolCall: true, inputTokens: 300_000 }, { toolCall: true }]);
    const run = context();
    await enrichment.enrichLead(run);

    assert.equal(calls.length, 3);
    assert.ok(calls[0].tools.length > 2);
    assert.deepEqual(calls[1].tools, ["recordFinding"]);
    assert.ok(calls[1].system.includes(enrichment.WRAP_UP_NOTE));
    assert.equal(calls[2].toolChoice, "none");
    const memory = await mastra.getMastra().getStorage()?.getStore("memory");
    const { messages } = await memory!.listMessages({ threadId: run.leadId });
    assert.ok(messages.length > 0);
    assert.ok(!JSON.stringify(messages).includes(enrichment.WRAP_UP_NOTE));
  });

  it("logs the run line, with its cost so far, when the model call fails", async () => {
    // Marked the way the AI SDK's `APICallError.isInstance` checks, so Mastra
    // sees a provider error it mustn't retry.
    const failure = Object.assign(new Error("Bad Request"), {
      name: "AI_APICallError",
      isRetryable: false,
      statusCode: 400,
      [Symbol.for("vercel.ai.error")]: true,
      [Symbol.for("vercel.ai.error.AI_APICallError")]: true,
    });
    // Mastra logs the failed call itself.
    for (const level of ["error", "warn", "log"] as const) mock.method(console, level, () => {});
    useMockModel([{ toolCall: true }, { fail: failure }]);
    await assert.rejects(enrichment.enrichLead(context()));

    const [line] = runLines();
    assert.match(line, / failed in .* 1 steps, \$0\.002 \(model \$0\.002\)/);
  });

  it("throws the run's own failure when generate rejects after it", async () => {
    useMockModel([{}]);
    const agent = mastra.getMastra().getAgent("enrichmentAgent");
    mock.method(agent, "generate", async (_prompt: unknown, options: { prepareStep(args: unknown): unknown }) => {
      // A step that overshoots the backstop, then a rejection.
      options.prepareStep({ stepNumber: 1, steps: [{ usage: { inputTokens: 600_000, outputTokens: 0 } }], systemMessages: [] });
      throw new DOMException("Enrichment stopped", "AbortError");
    });
    await assert.rejects(enrichment.enrichLead(context()), /Stopped at the cost backstop: \$1\.20/);
    assert.match(runLines()[0], / failed in /);
  });
});
