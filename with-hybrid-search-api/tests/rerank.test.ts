import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { APICallError, RetryError } from "ai";
import {
  isRetryableGatewayError,
  rerankResults,
  splitRerankBatches,
} from "../src/rerank.ts";

const rows = [
  {
    id: "first",
    chunkId: 1,
    heading: "Branching",
    content: "First passage",
    vectorRank: 1,
    keywordRank: null,
  },
  {
    id: "second",
    heading: "Isolation",
    content: "Second passage",
    chunkId: 2,
    vectorRank: 2,
    keywordRank: 1,
  },
  {
    id: "third",
    heading: "Copy on write",
    content: "Third passage",
    chunkId: 3,
    vectorRank: null,
    keywordRank: 2,
  },
];

const fallback = [
  { ...rows[1]!, score: 1 / 62 + 1 / 61 },
  { ...rows[0]!, score: 1 / 61 },
];

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

function gateway(t: TestContext, respond: (body: RequestBody) => Response) {
  const previousToken = process.env.NEON_AI_GATEWAY_TOKEN;
  const previousBase = process.env.NEON_AI_GATEWAY_BASE_URL;
  process.env.NEON_AI_GATEWAY_TOKEN = "test-placeholder";
  process.env.NEON_AI_GATEWAY_BASE_URL = "https://example.test";
  t.after(() => {
    if (previousToken === undefined) delete process.env.NEON_AI_GATEWAY_TOKEN;
    else process.env.NEON_AI_GATEWAY_TOKEN = previousToken;
    if (previousBase === undefined) delete process.env.NEON_AI_GATEWAY_BASE_URL;
    else process.env.NEON_AI_GATEWAY_BASE_URL = previousBase;
  });
  return t.mock.method(
    globalThis,
    "fetch",
    async (url: unknown, init: RequestInit) => {
      assert.equal(String(url), "https://example.test/typesafe/v1/systemone");
      return respond(JSON.parse(init.body as string));
    },
  );
}

function success(probabilities: number[]) {
  return Response.json({
    answers: Object.fromEntries(
      probabilities.map((noul, index) => [`c${index}`, { type: "noul", noul }]),
    ),
  });
}

test("Jev ranks the complete union before the final limit and breaks ties by chunk ID", async (t) => {
  gateway(t, (body) => {
    assert.equal(body.model, "typesafeai-jev-1-14-0");
    assert.deepEqual(body.state, { query: "isolated branches" });
    assert.equal(Object.keys(body.questions).length, 3);
    assert.equal(body.questions.c0!.type, "noul");
    return success([0.1, 0.9, 0.9]);
  });
  const result = await rerankResults({
    query: "isolated branches",
    candidates: [rows[0]!, rows[2]!, rows[1]!],
    limit: 2,
    rrfK: 60,
  });
  assert.equal(result.reranker, "jev");
  assert.deepEqual(
    result.results.map((row) => row.id),
    ["second", "third"],
  );
  if (result.reranker !== "jev") assert.fail("Expected Jev results");
  assert.equal(result.results[0]!.relevanceProbability, 0.9);
  assert.ok(result.results.every((row) => !("score" in row)));
});

test("non-retryable model access errors fall back immediately to RRF", async (t) => {
  const fetch = gateway(t, () =>
    Response.json(
      { error: { message: "model access denied" } },
      { status: 403 },
    ),
  );
  const result = await rerankResults({
    query: "branching",
    candidates: rows,
    limit: 2,
    rrfK: 60,
  });
  assert.equal(result.reranker, "rrf");
  assert.deepEqual(result.results, fallback);
  assert.equal(fetch.mock.callCount(), 1);
});

test("RRF fallback respects k, missing ranks, and deterministic ties without mutating candidates", async (t) => {
  gateway(t, () =>
    Response.json({ error: { message: "denied" } }, { status: 403 }),
  );
  const candidates = [
    { ...rows[0]!, chunkId: 9 },
    { ...rows[0]!, chunkId: 4, vectorRank: null, keywordRank: 1 },
    rows[1]!,
  ];
  const before = structuredClone(candidates);
  const result = await rerankResults({
    query: "branching",
    candidates,
    limit: 3,
    rrfK: 1,
  });
  assert.deepEqual(result, {
    reranker: "rrf",
    results: [
      { ...candidates[2]!, score: 1 / 3 + 1 / 2 },
      { ...candidates[1]!, score: 1 / 2 },
      { ...candidates[0]!, score: 1 / 2 },
    ],
  });
  assert.deepEqual(candidates, before);
});

test("a transient error is retried and successful Jev results are used", async (t) => {
  let calls = 0;
  gateway(t, () =>
    ++calls === 1
      ? Response.json({ error: { message: "busy" } }, { status: 429 })
      : success([0.1, 0.9, 0.5]),
  );
  const result = await rerankResults({
    query: "branching",
    candidates: rows,
    limit: 1,
    rrfK: 60,
  });
  assert.equal(result.reranker, "jev");
  assert.equal(result.results[0]!.id, "second");
  assert.equal(calls, 2);
});

test("a permanent error in a later batch restores the entire RRF order", async (t) => {
  const candidates = Array.from({ length: 17 }, (_, index) => ({
    ...rows[0]!,
    id: String(index),
    chunkId: index,
    vectorRank: 17 - index,
  }));
  let calls = 0;
  gateway(t, (body) =>
    ++calls === 1
      ? success(Object.keys(body.questions).map((_, index) => index / 16))
      : Response.json({ error: { message: "access denied" } }, { status: 403 }),
  );
  assert.deepEqual(
    await rerankResults({
      query: "branching",
      candidates: candidates,
      limit: 2,
      rrfK: 60,
    }),
    {
      reranker: "rrf",
      results: [
        { ...candidates[16]!, score: 1 / 61 },
        { ...candidates[15]!, score: 1 / 62 },
      ],
    },
  );
  assert.equal(calls, 2);
});

test("retry exhaustion propagates rather than falling back", async (t) => {
  const fetch = gateway(t, () =>
    Response.json({ error: { message: "unavailable" } }, { status: 503 }),
  );
  await assert.rejects(
    rerankResults({ query: "branching", candidates: rows, limit: 2, rrfK: 60 }),
    isRetryableGatewayError,
  );
  assert.equal(fetch.mock.callCount(), 3);
});

test("a non-retryable response after a transient failure falls back to RRF", async (t) => {
  let calls = 0;
  gateway(t, () =>
    Response.json(
      { error: { message: "model unavailable" } },
      { status: ++calls === 1 ? 503 : 403 },
    ),
  );
  assert.deepEqual(
    await rerankResults({
      query: "branching",
      candidates: rows,
      limit: 2,
      rrfK: 60,
    }),
    {
      reranker: "rrf",
      results: fallback,
    },
  );
  assert.equal(calls, 2);
});

test("a reranking timeout propagates rather than falling back", async (t) => {
  gateway(t, () => {
    throw new DOMException("deadline", "TimeoutError");
  });
  await assert.rejects(
    rerankResults({ query: "branching", candidates: rows, limit: 2, rrfK: 60 }),
    isRetryableGatewayError,
  );
});

test("missing or invalid probabilities fall back without returning partial Jev scores", async (t) => {
  let response = success([0.9]);
  gateway(t, () => response);
  assert.deepEqual(
    await rerankResults({
      query: "branching",
      candidates: rows,
      limit: 2,
      rrfK: 60,
    }),
    {
      reranker: "rrf",
      results: fallback,
    },
  );
  response = success([0.9, 1.1, 0.5]);
  assert.equal(
    (
      await rerankResults({
        query: "branching",
        candidates: rows,
        limit: 2,
        rrfK: 60,
      })
    ).reranker,
    "rrf",
  );
});

test("reranking is bounded, batches candidates, and shares one deadline", async (t) => {
  const signals: AbortSignal[] = [];
  const deadlines: number[] = [];
  const timeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, "timeout", (ms: number) => {
    deadlines.push(ms);
    return timeout(ms);
  });
  let evaluated = 0;
  const fetch = gateway(t, (body) => {
    const candidates = Object.values(body.questions);
    assert.ok(candidates.length <= 16);
    assert.ok(
      Buffer.byteLength(
        JSON.stringify({ state: body.state, questions: body.questions }),
        "utf8",
      ) <= 48_000,
    );
    for (const candidate of candidates) {
      assert.ok(candidate.instructions.candidate.content.length <= 2000);
      assert.ok(candidate.instructions.candidate.heading.length <= 256);
    }
    return success(candidates.map(() => (++evaluated === 90 ? 1 : 0.5)));
  });
  const many = Array.from({ length: 90 }, (_, index) => ({
    ...rows[0]!,
    id: String(index),
    chunkId: index,
    content: "雪".repeat(4000),
    heading: "h".repeat(500),
  }));
  const result = await rerankResults({
    query: "branching",
    candidates: many,
    limit: 2,
    rrfK: 60,
  });
  for (const call of fetch.mock.calls)
    signals.push((call.arguments[1] as RequestInit).signal!);
  assert.deepEqual(
    result.results.map((row) => row.id),
    ["89", "0"],
  );
  assert.equal(result.reranker, "jev");
  assert.equal(evaluated, 90);
  assert.deepEqual(deadlines, [15_000]);
  assert.equal(new Set(signals).size, 1);
  assert.ok(fetch.mock.callCount() > 1);
});

test("empty results skip the gateway and oversized reranking input uses RRF", async (t) => {
  const fetch = gateway(t, () => {
    throw new Error("must not call Gateway");
  });
  assert.deepEqual(
    await rerankResults({
      query: "branching",
      candidates: [],
      limit: 2,
      rrfK: 60,
    }),
    {
      reranker: "jev",
      results: [],
    },
  );
  assert.equal(
    (
      await rerankResults({
        query: "雪".repeat(20_000),
        candidates: rows,
        limit: 2,
        rrfK: 60,
      })
    ).reranker,
    "rrf",
  );
  assert.equal(fetch.mock.callCount(), 0);
  assert.throws(() => splitRerankBatches("雪".repeat(20_000), rows), /budget/);
});

test("timeouts and wrapped transient errors remain retryable", () => {
  const transient = new APICallError({
    message: "busy",
    url: "https://example.test",
    requestBodyValues: {},
    statusCode: 503,
    isRetryable: true,
  });
  assert.ok(
    isRetryableGatewayError(new DOMException("deadline", "TimeoutError")),
  );
  assert.ok(
    isRetryableGatewayError(new DOMException("cancelled", "AbortError")),
  );
  assert.ok(
    isRetryableGatewayError(
      new RetryError({
        message: "exhausted",
        reason: "maxRetriesExceeded",
        errors: [transient],
      }),
    ),
  );
  assert.equal(
    isRetryableGatewayError(
      new APICallError({
        message: "denied",
        url: "https://example.test",
        requestBodyValues: {},
        statusCode: 403,
        isRetryable: false,
      }),
    ),
    false,
  );
});
