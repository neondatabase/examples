import assert from "node:assert/strict";
import test from "node:test";
import { isSearchableObject, objectDocumentId } from "../src/storage.ts";

test("only text files under the configured Neon bucket prefix are ingested", () => {
  assert.equal(isSearchableObject("documents/notes.md"), true);
  assert.equal(isSearchableObject("documents/report.MDX"), true);
  assert.equal(isSearchableObject("other/notes.md"), false);
  assert.equal(isSearchableObject("documents/report.pdf"), false);
});

test("object keys map to stable URL-safe document IDs", () => {
  const id = objectDocumentId("documents/notes.md");
  assert.match(id, /^object:[a-f0-9]{64}$/);
  assert.equal(id, objectDocumentId("documents/notes.md"));
  assert.notEqual(id, objectDocumentId("documents/other.md"));
});
