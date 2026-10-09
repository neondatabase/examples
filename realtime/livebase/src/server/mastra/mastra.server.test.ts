import assert from "node:assert/strict";
import { inspect } from "node:util";
import { after, before, beforeEach, describe, it, mock } from "node:test";

// Mastra's logger: a failed model call logs a one-line summary, not
// the provider error with its URL and request body. The last test runs the
// app's real Mastra and agent with a mock model and an in-memory store: no
// database, no network and no model calls.

type MastraModule = typeof import("./mastra.server");

let mastra: MastraModule;

before(async () => {
  // `db.server.ts` needs a URL to build its pool, which never connects here.
  process.env.DATABASE_URL ??= "postgres://livebase:livebase@127.0.0.1:1/livebase";
  const { InMemoryStore } = await import("@mastra/core/storage");
  // `getStore()` and `getMemory()` use the cached store.
  (globalThis as typeof globalThis & { livebaseMastraStore?: unknown }).livebaseMastraStore = new InMemoryStore();
  mastra = await import("./mastra.server");
});

after(async () => {
  await mastra.getMastra().shutdown();
});

const SECRET_BODY = "Met Jane Doe from Acme, jane@acme.com";
const GATEWAY_URL = "https://gateway.example/v1/chat/completions";

// Marked the way the AI SDK's `APICallError.isInstance` checks, with the
// properties that made R3's log lines 20 KB.
function apiCallError(): Error {
  return Object.assign(new Error("Too Many Requests"), {
    name: "AI_APICallError",
    isRetryable: false,
    statusCode: 429,
    url: GATEWAY_URL,
    requestBodyValues: { messages: [{ role: "user", content: SECRET_BODY.repeat(500) }] },
    responseHeaders: { "retry-after": "30" },
    responseBody: "x".repeat(5_000),
    [Symbol.for("vercel.ai.error")]: true,
    [Symbol.for("vercel.ai.error.AI_APICallError")]: true,
  });
}

type ConsoleMock = { mock: { calls: { arguments: unknown[] }[] } };

function printed(method: "error" | "warn" | "info"): string[] {
  return (console[method] as unknown as ConsoleMock).mock.calls.map((call) =>
    call.arguments.map((arg) => (typeof arg === "string" ? arg : inspect(arg, { depth: 10 }))).join(" "),
  );
}

describe("summarizeLogArg", () => {
  it("cuts an error to its name, message and HTTP status", () => {
    assert.equal(mastra.summarizeLogArg(apiCallError()), "AI_APICallError: Too Many Requests (HTTP 429)");
  });

  it("keeps an object's scalars and names its nested values", () => {
    const summary = mastra.summarizeLogArg({
      error: apiCallError(),
      runId: "run-1",
      attempt: 2,
      request: { body: SECRET_BODY },
      steps: [1, 2, 3],
    });
    assert.deepEqual(summary, {
      error: "AI_APICallError: Too Many Requests (HTTP 429)",
      runId: "run-1",
      attempt: 2,
      request: "[object]",
      steps: "[3 items]",
    });
  });

  it("clips long text to one line", () => {
    const summary = mastra.summarizeLogArg(`first\nsecond ${"x".repeat(1_000)}`);
    assert.equal(typeof summary, "string");
    assert.ok((summary as string).length <= 300);
    assert.match(summary as string, /^first second x+…$/);
  });

  it("bounds the number of fields", () => {
    const wide = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, i]));
    const summary = mastra.summarizeLogArg(wide) as Record<string, unknown>;
    assert.equal(Object.keys(summary).length, 13);
    assert.equal(summary.more, "8 more fields");
  });
});

describe("ConciseLogger", () => {
  beforeEach(() => {
    mock.restoreAll();
    for (const method of ["error", "warn", "info"] as const) mock.method(console, method, () => {});
  });

  it("prints warnings and errors only, by default", () => {
    const logger = new mastra.ConciseLogger();
    logger.debug("debug line");
    logger.info("info line");
    logger.warn("warn line");
    logger.error("error line");
    assert.deepEqual(printed("info"), []);
    assert.deepEqual(printed("warn"), ["warn line"]);
    assert.deepEqual(printed("error"), ["error line"]);
  });

  it("keeps the summaries in a component's child logger", () => {
    const child = new mastra.ConciseLogger().child({ component: "AGENT" });
    assert.ok(child instanceof mastra.ConciseLogger);
    child.error("Upstream LLM API error", { error: apiCallError(), runId: "run-1" });
    const [line] = printed("error");
    assert.match(line, /^\[AGENT\] Upstream LLM API error \{/);
    assert.match(line, /AI_APICallError: Too Many Requests \(HTTP 429\)/);
    assert.doesNotMatch(line, /gateway\.example|Jane Doe/);
  });

  it("logs a failed model call from the app's Mastra in one short line", async () => {
    const agent = mastra.getMastra().getAgent("enrichmentAgent");
    const model = {
      specificationVersion: "v2",
      provider: "mock",
      modelId: "mock-model",
      supportedUrls: {},
      async doGenerate() {
        throw apiCallError();
      },
      async doStream() {
        throw new Error("not used");
      },
    };
    (agent as unknown as { __updateModel(config: { model: unknown }): void }).__updateModel({ model });

    // `isRetryable: false`, so the agent's `maxRetries` doesn't retry it.
    await agent.generate("Say hi.").catch(() => {});

    const lines = printed("error");
    const upstream = lines.filter((line) => line.includes("Upstream LLM API error"));
    assert.ok(upstream.length >= 1, lines.join("\n"));
    for (const line of lines) {
      assert.ok(line.length < 1_000, `${line.length} bytes: ${line.slice(0, 200)}`);
      assert.doesNotMatch(line, /gateway\.example|Jane Doe|retry-after/);
    }
    assert.match(upstream[0], /AI_APICallError: Too Many Requests \(HTTP 429\)/);
  });
});
