import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { hybridSearchSql, keywordSearchSql } from "../src/search-sql.ts";

const dialect = new PgDialect();
const query = "postgres branching";
const filter = { source: "docs" };

test("BM25-ranked full-text search excludes zero scores, allows partial matches, and preserves metadata filtering", () => {
  const compiled = dialect.sqlToQuery(keywordSearchSql(query, filter, 10));
  // The matching contract must not exclude a document missing one query term.
  assert.doesNotMatch(compiled.sql, /@@|plainto_tsquery/);
  assert.match(
    compiled.sql,
    /FROM search_chunks c JOIN search_documents d ON d.id = c.document_id/,
  );
  assert.match(compiled.sql, /c.id AS "chunkId"/);
  assert.match(compiled.sql, /WHERE d\.metadata @>/);
  assert.match(compiled.sql, /to_bm25query\(to_tsvector\('english', \$\d+\)/);
  assert.match(
    compiled.sql,
    /AND[\s\S]*?'search_chunks_text_bm25'::regclass\) < 0/,
  );
  assert.deepEqual(compiled.params, [query, JSON.stringify(filter), query, 10]);
});

test("hybrid SQL returns the bounded deduplicated union without fusion scores or a final cutoff", () => {
  const vector = Array(1024).fill(0);
  vector[0] = 1;
  const compiled = dialect.sqlToQuery(
    hybridSearchSql({ embedding: vector, query, filter, candidates: 40 }),
  );
  assert.doesNotMatch(compiled.sql, /@@|plainto_tsquery/);
  assert.match(
    compiled.sql,
    /FROM search_chunks c JOIN search_documents d ON d.id = c.document_id/,
  );
  assert.match(compiled.sql, /c.id AS "chunkId"/);
  assert.equal((compiled.sql.match(/WHERE d\.metadata @>/g) ?? []).length, 2);
  assert.equal((compiled.sql.match(/LIMIT \$\d+/g) ?? []).length, 2);
  assert.doesNotMatch(
    compiled.sql,
    /WITH TIES|COALESCE|rrf_score|ORDER BY score DESC/,
  );
  assert.match(
    compiled.sql,
    /SELECT id FROM vector_ranked\s+UNION\s+SELECT id FROM keyword_ranked/,
  );
  assert.match(compiled.sql, /FROM candidate_ids candidates/);
  assert.equal((compiled.sql.match(/RANK\(\) OVER/g) ?? []).length, 2);
  assert.equal(
    compiled.params.filter((value) => value === JSON.stringify(filter)).length,
    2,
  );
  const keywordCandidates = compiled.sql
    .split("keyword_candidates AS (")[1]!
    .split("keyword_ranked AS (")[0]!;
  assert.match(
    keywordCandidates,
    /AND[\s\S]*?'search_chunks_text_bm25'::regclass\) < 0/,
  );
  assert.equal(compiled.params.filter((value) => value === query).length, 2);
  assert.match(compiled.sql, /ORDER BY c\.id\s*$/);
  assert.equal(compiled.params.filter((value) => value === 40).length, 2);
  assert.ok(!compiled.params.includes(60));
});
