import assert from "node:assert/strict";
import test from "node:test";
import {
  documentId,
  parsePatch,
  parsePut,
  parseSearch,
  validateVector,
} from "../src/input.ts";

test("document writes validate searchable content and flexible metadata", () => {
  assert.deepEqual(
    parsePut({
      content: "  hello  ",
      metadata: { source: "docs", priority: 2 },
    }),
    {
      content: "hello",
      metadata: { source: "docs", priority: 2 },
    },
  );
  assert.deepEqual(
    parsePatch({ metadata: { source: "new" }, removeMetadataKeys: ["old"] }),
    {
      content: null,
      metadata: { source: "new" },
      removeMetadataKeys: ["old"],
    },
  );
  assert.throws(() => parsePut({ content: "", metadata: {} }), /content/);
  assert.throws(() => parsePatch({ metadata: [] }), /metadata/);
  assert.throws(() => parsePatch({}), /provide/);
  assert.equal(documentId("docs:doc-1"), "docs:doc-1");
  assert.throws(() => documentId("../doc"), /id/);
});

test("search bounds work for API calls and retrieval tuning", () => {
  assert.deepEqual(
    parseSearch({ query: "  exact phrase  ", filter: { source: "docs" } }),
    {
      query: "exact phrase",
      mode: "hybrid",
      limit: 10,
      candidates: 40,
      rrfK: 60,
      filter: { source: "docs" },
    },
  );
  assert.equal(
    parseSearch({ query: "test", mode: "keyword", limit: 2, candidates: 2 })
      .mode,
    "keyword",
  );
  assert.throws(() => parseSearch({ query: "test", limit: 21 }), /limit/);
  assert.throws(
    () => parseSearch({ query: "test", limit: 10, candidates: 5 }),
    /candidates/,
  );
  assert.throws(
    () => parseSearch({ query: "test", filter: null }),
    /filter|metadata/,
  );
});

test("Zod rejects malformed HTTP fields without coercing values", () => {
  assert.throws(() => parsePut(null), /body must be a JSON object/);
  assert.throws(() => parsePut({ content: " ".repeat(20_001) }), /content/);
  assert.throws(
    () =>
      parsePut({ content: "hello", metadata: { note: "x".repeat(16_000) } }),
    /metadata is too large/,
  );
  assert.throws(
    () => parsePatch({ removeMetadataKeys: [""] }),
    /removeMetadataKeys/,
  );
  assert.throws(() => parseSearch({ query: "test", limit: "5" }), /limit/);
  assert.throws(() => parseSearch({ query: "test", mode: "semantic" }), /mode/);
  assert.throws(() => parsePut({ content: "ok", metdata: {} }), /metdata/);
  assert.throws(() => parseSearch({ query: "test", limt: 5 }), /limt/);
  assert.throws(() => documentId(42), /id/);
});

test("reject unexpected gateway vector shapes before writing", () => {
  assert.throws(() => validateVector([1, 2]), /1024/);
  assert.throws(
    () => validateVector([...Array(1023).fill(0), Infinity]),
    /invalid/,
  );
  assert.equal(validateVector(Array(1024).fill(0)).length, 1024);
});
