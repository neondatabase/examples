import { sql } from "drizzle-orm";

// BM25-ranked full-text search uses a Lakebase-specific scoring operator.
// Every request value is bound through Drizzle's sql template.
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

export type HybridCandidate = {
  id: string;
  chunkId: number;
  chunkIndex: number;
  heading: string;
  content: string;
  metadata: Record<string, unknown>;
  updatedAt: Date;
  vectorRank: number | null;
  keywordRank: number | null;
};

type HybridSearchOptions = {
  embedding: number[];
  query: string;
  filter: object;
  candidates: number;
};

// Bound each retriever before taking their union; no fusion score filters Jev's input.
export const hybridSearchSql = ({
  embedding,
  query,
  filter,
  candidates,
}: HybridSearchOptions) => sql`
  WITH vector_candidates AS (
    SELECT c.id, c.embedding <=> ${JSON.stringify(embedding)}::vector AS distance
    FROM search_chunks c JOIN search_documents d ON d.id = c.document_id
    WHERE d.metadata @> ${JSON.stringify(filter)}::jsonb
    ORDER BY distance, c.id
    LIMIT ${candidates}
  ),
  vector_ranked AS (
    SELECT id, (RANK() OVER (ORDER BY distance))::integer AS vector_rank
    FROM vector_candidates
  ),
  keyword_candidates AS (
    SELECT c.id, ${bm25Score(query)} AS score
    FROM search_chunks c JOIN search_documents d ON d.id = c.document_id
    WHERE d.metadata @> ${JSON.stringify(filter)}::jsonb
      AND ${bm25Score(query)} < 0
    ORDER BY score, c.id
    LIMIT ${candidates}
  ),
  keyword_ranked AS (
    SELECT id, (RANK() OVER (ORDER BY score))::integer AS keyword_rank
    FROM keyword_candidates
  ),
  candidate_ids AS (
    SELECT id FROM vector_ranked
    UNION
    SELECT id FROM keyword_ranked
  )
  SELECT d.id, c.id AS "chunkId", c.chunk_index AS "chunkIndex", c.heading,
         c.content, d.metadata, d.updated_at AS "updatedAt",
         v.vector_rank AS "vectorRank", k.keyword_rank AS "keywordRank"
  FROM candidate_ids candidates
  JOIN search_chunks c ON c.id = candidates.id
  JOIN search_documents d ON d.id = c.document_id
  LEFT JOIN vector_ranked v ON v.id = c.id
  LEFT JOIN keyword_ranked k ON k.id = c.id
  ORDER BY c.id`;
