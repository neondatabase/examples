import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { hybridSearchSql, keywordSearchSql } from "../src/search-sql.ts";

const dialect = new PgDialect();
const query = "postgres branching";
const filter = { source: "docs" };

test("keyword SQL delegates term matching to BM25 and preserves metadata filtering", () => {
  const compiled = dialect.sqlToQuery(keywordSearchSql(query, filter, 10));
  // The matching contract must not exclude a document missing one query term.
  assert.doesNotMatch(compiled.sql, /@@|plainto_tsquery/);
  assert.match(compiled.sql, /WHERE metadata @>/);
  assert.match(compiled.sql, /to_bm25query\(to_tsvector\('english', \$\d+\)/);
  assert.deepEqual(compiled.params, [query, JSON.stringify(filter), 10]);
});

test("hybrid SQL retains both metadata filters, relevance ties, and final cap", () => {
  const vector = Array(1024).fill(0);
  vector[0] = 1;
  const compiled = dialect.sqlToQuery(
    hybridSearchSql(vector, query, filter, 40, 60, 10),
  );
  assert.doesNotMatch(compiled.sql, /@@|plainto_tsquery/);
  assert.equal((compiled.sql.match(/WHERE metadata @>/g) ?? []).length, 2);
  assert.equal(
    (compiled.sql.match(/FETCH FIRST \$\d+ ROWS WITH TIES/g) ?? []).length,
    2,
  );
  assert.equal(
    compiled.params.filter((value) => value === JSON.stringify(filter)).length,
    2,
  );
  assert.ok(compiled.params.includes(query));
  assert.match(compiled.sql, /ORDER BY score DESC, d\.id\s+LIMIT \$\d+/);
  assert.equal(compiled.params.at(-1), 10);
});
