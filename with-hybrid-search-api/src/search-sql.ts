import { sql } from "drizzle-orm";

// Lakebase BM25 and RRF have no query-builder equivalents. Every request value
// is bound through Drizzle's sql template.
export const keywordSearchSql = (
  query: string,
  filter: object,
  limit: number,
) =>
  sql`
    SELECT id, content, metadata, updated_at AS "updatedAt",
           search_tsv <@> to_bm25query(to_tsvector('english', ${query}),
             'search_documents_text_bm25'::regclass) AS "bm25Score"
    FROM search_documents
    WHERE metadata @> ${JSON.stringify(filter)}::jsonb
      AND search_tsv @@ plainto_tsquery('english', ${query})
    ORDER BY "bm25Score", id
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
    SELECT id, embedding <=> ${JSON.stringify(embedding)}::vector AS distance
    FROM search_documents
    WHERE metadata @> ${JSON.stringify(filter)}::jsonb
    -- Keep the full boundary tie group before assigning ranks.
    ORDER BY embedding <=> ${JSON.stringify(embedding)}::vector
    FETCH FIRST ${candidates} ROWS WITH TIES
  ),
  vector_ranked AS (
    SELECT id, RANK() OVER (ORDER BY distance) AS vector_rank
    FROM vector_candidates
  ),
  keyword_candidates AS (
    SELECT id, search_tsv <@> to_bm25query(to_tsvector('english', ${query}),
      'search_documents_text_bm25'::regclass) AS score
    FROM search_documents
    WHERE metadata @> ${JSON.stringify(filter)}::jsonb
      AND search_tsv @@ plainto_tsquery('english', ${query})
    ORDER BY score
    FETCH FIRST ${candidates} ROWS WITH TIES
  ),
  keyword_ranked AS (
    SELECT id, RANK() OVER (ORDER BY score) AS keyword_rank
    FROM keyword_candidates
  )
  SELECT d.id, d.content, d.metadata, d.updated_at AS "updatedAt",
         v.vector_rank AS "vectorRank", k.keyword_rank AS "keywordRank",
         (COALESCE(1.0 / (${rrfK} + v.vector_rank), 0) +
          COALESCE(1.0 / (${rrfK} + k.keyword_rank), 0))::double precision AS score
  FROM search_documents d
  LEFT JOIN vector_ranked v ON v.id = d.id
  LEFT JOIN keyword_ranked k ON k.id = d.id
  WHERE v.id IS NOT NULL OR k.id IS NOT NULL
  ORDER BY score DESC, d.id
  LIMIT ${limit}`;
