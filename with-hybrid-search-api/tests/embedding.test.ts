import assert from "node:assert/strict";
import test from "node:test";
import { createEmbedder } from "../src/embedding.ts";

test("only query embeddings receive the Qwen retrieval instruction", async (t) => {
  const previousToken = process.env.NEON_AI_GATEWAY_TOKEN;
  const previousBaseUrl = process.env.NEON_AI_GATEWAY_BASE_URL;
  process.env.NEON_AI_GATEWAY_TOKEN = "test-placeholder";
  process.env.NEON_AI_GATEWAY_BASE_URL = "https://example.test";
  const requests: {
    input: string[];
    model: string;
    dimensions: number;
    encoding_format: string;
  }[] = [];
  const vector = Array(1024).fill(0);
  vector[0] = 1;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      requests.push(JSON.parse(init.body as string));
      return new Response(
        JSON.stringify({
          object: "list",
          data: [{ object: "embedding", index: 0, embedding: vector }],
          model: "qwen3-embedding-0-6b",
          usage: { prompt_tokens: 1, total_tokens: 1 },
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  );
  try {
    const embed = createEmbedder();
    const text = "How do isolated branches work?";
    assert.deepEqual(await embed(text), vector);
    assert.deepEqual(await embed(text, "query"), vector);
    assert.deepEqual(
      requests.map((request) => request.input),
      [
        [text],
        [
          `Instruct: Given a search query, retrieve relevant documents that answer the query\nQuery: ${text}`,
        ],
      ],
    );
    for (const request of requests) {
      assert.equal(request.model, "qwen3-embedding-0-6b");
      assert.equal(request.encoding_format, "float");
      assert.equal(request.dimensions, 1024);
    }
  } finally {
    if (previousToken === undefined) delete process.env.NEON_AI_GATEWAY_TOKEN;
    else process.env.NEON_AI_GATEWAY_TOKEN = previousToken;
    if (previousBaseUrl === undefined)
      delete process.env.NEON_AI_GATEWAY_BASE_URL;
    else process.env.NEON_AI_GATEWAY_BASE_URL = previousBaseUrl;
  }
});

test("SDK batches respect provider limits, retain duplicates, and share one deadline", async (t) => {
  const oldToken = process.env.NEON_AI_GATEWAY_TOKEN;
  const oldBase = process.env.NEON_AI_GATEWAY_BASE_URL;
  process.env.NEON_AI_GATEWAY_TOKEN = "test-placeholder";
  process.env.NEON_AI_GATEWAY_BASE_URL = "https://example.test";
  t.after(() => {
    if (oldToken === undefined) delete process.env.NEON_AI_GATEWAY_TOKEN;
    else process.env.NEON_AI_GATEWAY_TOKEN = oldToken;
    if (oldBase === undefined) delete process.env.NEON_AI_GATEWAY_BASE_URL;
    else process.env.NEON_AI_GATEWAY_BASE_URL = oldBase;
  });
  const signals: (AbortSignal | null | undefined)[] = [];
  const batches: number[] = [];
  const deadlines: number[] = [];
  const timeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, "timeout", (ms: number) => {
    deadlines.push(ms);
    return timeout(ms);
  });
  let inFlight = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      assert.equal(inFlight++, 0);
      const { input } = JSON.parse(init.body as string) as { input: string[] };
      signals.push(init.signal);
      batches.push(input.length);
      await new Promise((resolve) => setImmediate(resolve));
      inFlight--;
      return Response.json({
        data: input.map((value, index) => ({
          index,
          embedding: [Number(value) + 1, ...Array(1023).fill(0)],
        })),
      });
    },
  );
  const texts = [...Array.from({ length: 151 }, (_, i) => String(i)), "0"];
  const vectors = await createEmbedder()(texts);
  assert.deepEqual(batches, [150, 2]);
  assert.deepEqual(deadlines, [30_000]);
  assert.equal(new Set(signals).size, 1);
  assert.ok(signals[0] instanceof AbortSignal);
  assert.deepEqual(
    vectors.map((vector) => vector[0]),
    texts.map((text) => Number(text) + 1),
  );
});

test("document embedding batches retain input order and reject incomplete responses", async (t) => {
  const oldToken = process.env.NEON_AI_GATEWAY_TOKEN;
  const oldBase = process.env.NEON_AI_GATEWAY_BASE_URL;
  process.env.NEON_AI_GATEWAY_TOKEN = "test-placeholder";
  process.env.NEON_AI_GATEWAY_BASE_URL = "https://example.test";
  const first = Array(1024).fill(0);
  first[0] = 1;
  const second = Array(1024).fill(0);
  second[1] = 1;
  let data = [
    { index: 1, embedding: second },
    { index: 0, embedding: first },
  ];
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      assert.deepEqual(JSON.parse(init.body as string).input, [
        "first section",
        "second section",
      ]);
      return new Response(JSON.stringify({ data }), {
        headers: { "content-type": "application/json" },
      });
    },
  );
  try {
    const embed = createEmbedder();
    assert.deepEqual(await embed(["first section", "second section"]), [
      first,
      second,
    ]);
    data = [{ index: 0, embedding: first }];
    await assert.rejects(
      embed(["first section", "second section"]),
      /no embedding/,
    );
    data = [
      { index: 0, embedding: first },
      { index: 0, embedding: second },
    ];
    await assert.rejects(
      embed(["first section", "second section"]),
      /invalid embedding indexes/,
    );
  } finally {
    if (oldToken === undefined) delete process.env.NEON_AI_GATEWAY_TOKEN;
    else process.env.NEON_AI_GATEWAY_TOKEN = oldToken;
    if (oldBase === undefined) delete process.env.NEON_AI_GATEWAY_BASE_URL;
    else process.env.NEON_AI_GATEWAY_BASE_URL = oldBase;
  }
});
