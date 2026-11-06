import { sql } from "drizzle-orm";

// Lakebase BM25 and RRF have no query-builder equivalents. Every request value
// is bound through Drizzle's sql template.
// Scalar scoring returns zero for non-matches; filter them under every plan.
const bm25Score = (query: string) => sql`
  c.search_tsv <@> to_bm25query(to_tsvector('english', ${query}),
    'search_chunks_text_bm25'::regclass)`;

export const keywordSearchSql = (
  query: string,
  filter: object,
  limit: number,
) => sql`
  SELECT d.id, c.id AS "chunkId", c.chunk_index AS "chunkIndex", c.heading,
         c.content, d.metadata, d.updated_at AS "updatedAt",
         ${bm25Score(query)} AS "bm25Score"
  FROM search_chunks c JOIN search_documents d ON d.id = c.document_id
  WHERE d.metadata @> ${JSON.stringify(filter)}::jsonb
    AND ${bm25Score(query)} < 0
  ORDER BY "bm25Score", c.id
  LIMIT ${limit}`;

export const hybridSearchSql = (
  embedding: number[],
  query: string,
  filter: object,
  candidates: number,
  rrfK: number,
  limit: number,
) => sql`
  WITH vector_candidates AS (
    SELECT c.id, c.embedding <=> ${JSON.stringify(embedding)}::vector AS distance
    FROM search_chunks c JOIN search_documents d ON d.id = c.document_id
    WHERE d.metadata @> ${JSON.stringify(filter)}::jsonb
    ORDER BY c.embedding <=> ${JSON.stringify(embedding)}::vector
    FETCH FIRST ${candidates} ROWS WITH TIES
  ),
  vector_ranked AS (
    SELECT id, RANK() OVER (ORDER BY distance) AS vector_rank FROM vector_candidates
  ),
  keyword_candidates AS (
    SELECT c.id, ${bm25Score(query)} AS score
    FROM search_chunks c JOIN search_documents d ON d.id = c.document_id
    WHERE d.metadata @> ${JSON.stringify(filter)}::jsonb
      AND ${bm25Score(query)} < 0
    ORDER BY score
    FETCH FIRST ${candidates} ROWS WITH TIES
  ),
  keyword_ranked AS (
    SELECT id, RANK() OVER (ORDER BY score) AS keyword_rank FROM keyword_candidates
  )
  SELECT d.id, c.id AS "chunkId", c.chunk_index AS "chunkIndex", c.heading,
         c.content, d.metadata, d.updated_at AS "updatedAt",
         v.vector_rank AS "vectorRank", k.keyword_rank AS "keywordRank",
         (COALESCE(1.0 / (${rrfK} + v.vector_rank), 0) +
          COALESCE(1.0 / (${rrfK} + k.keyword_rank), 0))::double precision AS score
  FROM search_chunks c JOIN search_documents d ON d.id = c.document_id
  LEFT JOIN vector_ranked v ON v.id = c.id
  LEFT JOIN keyword_ranked k ON k.id = c.id
  WHERE v.id IS NOT NULL OR k.id IS NOT NULL
  ORDER BY score DESC, c.id
  LIMIT ${limit}`;
