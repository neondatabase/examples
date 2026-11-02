import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { APICallError, RetryError } from "ai";
import { rerankResults } from "../src/rerank.ts";

// Deliberately differs from chunk-ID order: fallback must retain SQL RRF order.
const shortlist = Object.freeze(
  [3, 1, 2].map((chunkId) =>
    Object.freeze({
      chunkId,
      id: `doc-${chunkId}`,
      heading: "Branching",
      content: `Passage ${chunkId}`,
    }),
  ),
);
const options = { query: "branching", candidates: shortlist, limit: 2 };
const fallback = { reranker: "rrf", results: shortlist.slice(0, 2) };

type RequestBody = {
  model: string;
  state: { query: string };
  questions: Record<
    string,
    {
      type: string;
      instructions: { candidate: { content: string; heading: string } };
    }
  >;
};

function gateway(
  t: TestContext,
  respond: (
    body: RequestBody,
    signal: AbortSignal,
  ) => Response | Promise<Response>,
) {
  const previousToken = process.env.NEON_AI_GATEWAY_TOKEN;
  const previousBase = process.env.NEON_AI_GATEWAY_BASE_URL;
  process.env.NEON_AI_GATEWAY_TOKEN = "test-placeholder";
  process.env.NEON_AI_GATEWAY_BASE_URL = "https://example.test";
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) =>
      respond(JSON.parse(init.body as string), init.signal!),
  );
  t.after(() => {
    if (previousToken === undefined) delete process.env.NEON_AI_GATEWAY_TOKEN;
    else process.env.NEON_AI_GATEWAY_TOKEN = previousToken;
    if (previousBase === undefined) delete process.env.NEON_AI_GATEWAY_BASE_URL;
    else process.env.NEON_AI_GATEWAY_BASE_URL = previousBase;
    // Assert outside fetch: production catches errors from fetch for fallback.
    for (const call of fetch.mock.calls)
      assert.equal(
        String(call.arguments[0]),
        "https://example.test/typesafe/v1/systemone",
      );
  });
  return fetch;
}

function success(probabilities: number[]) {
  return Response.json({
    answers: Object.fromEntries(
      probabilities.map((noul, index) => [`c${index}`, { type: "noul", noul }]),
    ),
  });
}
const failure = (status: number) =>
  Response.json({ error: { message: "gateway error" } }, { status });

test("Jev reranks the full shortlist, breaks ties by chunk ID, and preserves result fields", async (t) => {
  const fetch = gateway(t, () => success([0, 1, 1]));
  assert.deepEqual(await rerankResults(options), {
    reranker: "jev",
    results: [shortlist[1], shortlist[2]],
  });
  assert.equal(fetch.mock.callCount(), 1);
  const body = JSON.parse(
    fetch.mock.calls[0]!.arguments[1]!.body as string,
  ) as RequestBody;
  assert.equal(body.model, "typesafeai-jev-1-14-0");
  assert.deepEqual(body.state, { query: "branching" });
  assert.deepEqual(
    Object.values(body.questions).map((q) => q.instructions.candidate),
    shortlist.map(({ heading, content }) => ({ heading, content })),
  );
  assert.ok(Object.values(body.questions).every((q) => q.type === "noul"));
});

for (const { name, statuses, reranker } of [
  {
    name: "permanent errors preserve SQL RRF order without retrying",
    statuses: [403],
    reranker: "rrf",
  },
  {
    name: "transient errors retry and recover",
    statuses: [429, 200],
    reranker: "jev",
  },
  {
    name: "retry exhaustion propagates after three attempts",
    statuses: [503, 503, 503],
    reranker: null,
  },
  {
    name: "a permanent error after a transient error falls back",
    statuses: [503, 403],
    reranker: "rrf",
  },
]) {
  test(name, async (t) => {
    let attempts = 0;
    gateway(t, () => {
      const status = statuses[attempts++] ?? 503;
      return status === 200 ? success([0, 1, 0.5]) : failure(status);
    });
    if (reranker === null) {
      await assert.rejects(rerankResults(options), (error: unknown) => {
        assert.ok(RetryError.isInstance(error));
        assert.equal(error.reason, "maxRetriesExceeded");
        assert.ok(APICallError.isInstance(error.lastError));
        assert.equal(error.lastError.statusCode, 503);
        return true;
      });
    } else {
      assert.deepEqual(
        await rerankResults(options),
        reranker === "rrf"
          ? fallback
          : {
              reranker: "jev",
              results: [shortlist[1], shortlist[2]],
            },
      );
    }
    assert.equal(attempts, statuses.length);
  });
}

test("a later-batch permanent error discards partial Jev results", async (t) => {
  const candidates = Array.from({ length: 17 }, (_, chunkId) => ({
    ...shortlist[0]!,
    chunkId,
  }));
  let attempts = 0;
  gateway(t, (body) =>
    ++attempts === 1
      ? success(Object.keys(body.questions).map((_, index) => index / 16))
      : failure(403),
  );
  assert.deepEqual(await rerankResults({ ...options, candidates }), {
    reranker: "rrf",
    results: candidates.slice(0, 2),
  });
  assert.equal(attempts, 2);
});

test("the shared deadline aborts an in-flight later batch without falling back", async (t) => {
  const controller = new AbortController();
  const reason = new DOMException("deadline", "TimeoutError");
  const timeout = t.mock.method(
    AbortSignal,
    "timeout",
    () => controller.signal,
  );
  let attempts = 0;
  const fetch = gateway(t, (body, signal) => {
    if (++attempts === 1)
      return success(Object.keys(body.questions).map(() => 0.5));
    return new Promise<Response>((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
      setImmediate(() => controller.abort(reason));
    });
  });
  const candidates = Array.from({ length: 17 }, (_, chunkId) => ({
    ...shortlist[0]!,
    chunkId,
  }));
  await assert.rejects(
    rerankResults({ ...options, candidates }),
    (error) => error === reason,
  );
  assert.deepEqual(
    timeout.mock.calls.map((call) => call.arguments),
    [[15_000]],
  );
  assert.equal(attempts, 2);
  assert.ok(
    fetch.mock.calls.every(
      (call) => call.arguments[1]!.signal === controller.signal,
    ),
  );
});

for (const { name, response } of [
  { name: "missing answers", response: () => success([0.9]) },
  {
    name: "out-of-range probabilities",
    response: () => success([0.9, 1.1, 0.5]),
  },
  {
    name: "wrong answer types",
    response: () =>
      Response.json({ answers: { c0: { type: "text", value: "yes" } } }),
  },
]) {
  test(`${name} restore the complete RRF fallback`, async (t) => {
    const fetch = gateway(t, response);
    assert.deepEqual(await rerankResults(options), fallback);
    assert.equal(fetch.mock.callCount(), 1);
  });
}

for (const { name, count, content } of [
  { name: "item limit", count: 100, content: "x".repeat(4000) },
  { name: "UTF-8 byte budget", count: 17, content: "雪".repeat(4000) },
]) {
  test(`batching respects the ${name}, excerpt limits, and global ranking`, async (t) => {
    let evaluated = 0;
    const fetch = gateway(t, (body) => {
      const questions = Object.values(body.questions);
      return success(questions.map(() => (++evaluated === count ? 1 : 0.5)));
    });
    const candidates = Array.from({ length: count }, (_, chunkId) => ({
      chunkId,
      content,
      heading: "h".repeat(500),
    }));
    assert.deepEqual(await rerankResults({ ...options, candidates }), {
      reranker: "jev",
      results: [candidates[count - 1], candidates[0]],
    });
    assert.equal(evaluated, count);
    assert.ok(fetch.mock.callCount() > 1);
    const sizes = fetch.mock.calls.map((call) => {
      const body = JSON.parse(call.arguments[1]!.body as string) as RequestBody;
      const questions = Object.values(body.questions);
      assert.ok(questions.length <= 16);
      assert.ok(
        Buffer.byteLength(
          JSON.stringify({ state: body.state, questions: body.questions }),
          "utf8",
        ) <= 48_000,
      );
      for (const {
        instructions: { candidate },
      } of questions) {
        assert.equal(candidate.content, content.slice(0, 2000));
        assert.equal(candidate.heading, "h".repeat(256));
      }
      return questions.length;
    });
    if (name === "item limit") assert.equal(sizes[0], 16);
    else assert.ok(sizes.every((size) => size < 16));
    assert.equal(
      new Set(fetch.mock.calls.map((call) => call.arguments[1]!.signal)).size,
      1,
    );
  });
}

test("empty and oversized inputs avoid gateway calls", async (t) => {
  const fetch = gateway(t, () => {
    throw new Error("unexpected gateway call");
  });
  assert.deepEqual(await rerankResults({ ...options, candidates: [] }), {
    reranker: "jev",
    results: [],
  });
  assert.deepEqual(
    await rerankResults({ ...options, query: "雪".repeat(20_000) }),
    fallback,
  );
  assert.equal(fetch.mock.callCount(), 0);
});
