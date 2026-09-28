import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { embeddingProvider, mockEmbedding } from "../src/mock-embedding.ts";

test("mock embeddings are stable, valid vectors without gateway credentials", () => {
  const first = mockEmbedding("Neon branches");
  assert.equal(first.length, 1024);
  assert.deepEqual(first, mockEmbedding("Neon branches"));
  assert.notDeepEqual(first, mockEmbedding("another document"));
  assert.ok(first.every((value) => Number.isFinite(value)));
});

test("gateway stays the default and provider names are checked", () => {
  assert.equal(embeddingProvider(undefined), "gateway");
  assert.equal(embeddingProvider("mock"), "mock");
  assert.throws(() => embeddingProvider("random"), /EMBEDDING_PROVIDER/);
});

test("invalid provider fails while evaluating deployment config", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      fileURLToPath(new URL("../neon.ts", import.meta.url)),
    ],
    {
      env: {
        ...process.env,
        EMBEDDING_PROVIDER: "typo",
        SEARCH_API_KEY: "a".repeat(32),
      },
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EMBEDDING_PROVIDER must be gateway or mock/);
});
