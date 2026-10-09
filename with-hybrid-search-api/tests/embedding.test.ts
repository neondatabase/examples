import assert from "node:assert/strict";
import test from "node:test";
import { createEmbedder } from "../src/embedding.ts";

test("only query embeddings receive the Qwen retrieval instruction", async (t) => {
  const previousToken = process.env.NEON_AI_GATEWAY_TOKEN;
  const previousBaseUrl = process.env.NEON_AI_GATEWAY_BASE_URL;
  process.env.NEON_AI_GATEWAY_TOKEN = "test-placeholder";
  process.env.NEON_AI_GATEWAY_BASE_URL = "https://example.test";
  const requests: { input: string; model: string; encoding_format: string }[] =
    [];
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
        text,
        `Instruct: Given a search query, retrieve relevant documents that answer the query\nQuery: ${text}`,
      ],
    );
    for (const request of requests) {
      assert.equal(request.model, "qwen3-embedding-0-6b");
      assert.equal(request.encoding_format, "float");
    }
  } finally {
    if (previousToken === undefined) delete process.env.NEON_AI_GATEWAY_TOKEN;
    else process.env.NEON_AI_GATEWAY_TOKEN = previousToken;
    if (previousBaseUrl === undefined)
      delete process.env.NEON_AI_GATEWAY_BASE_URL;
    else process.env.NEON_AI_GATEWAY_BASE_URL = previousBaseUrl;
  }
});
