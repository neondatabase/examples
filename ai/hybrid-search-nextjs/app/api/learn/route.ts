export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import { embedding } from 'litellm'
import { neon } from '@neondatabase/serverless'

export async function POST(request: Request) {
  const { message: input } = await request.json()
  if (!input) return new Response(null, { status: 400 })
  const queryFunction = neon(`${process.env.POSTGRES_URL}`)
  await queryFunction(`CREATE EXTENSION vector;`)
  await queryFunction(`
  create table if not exists documents (
    id bigint primary key generated always as identity,
    content text,
    fts tsvector generated always as (to_tsvector('english', content)) stored,
    embedding vector(512)
  );`)
  await queryFunction(`create index on documents using gin(fts);`)
  await queryFunction(`create index on documents using hnsw (embedding vector_ip_ops);`)
  // ref: https://supabase.com/docs/guides/ai/hybrid-search#hybrid-search-in-postgres
  await queryFunction(`create or replace function hybrid_search(
  query_text text,
  query_embedding vector(512),
  match_count int,
  full_text_weight float = 1,
  semantic_weight float = 1,
  rrf_k int = 50
)
returns setof documents
language sql
as $$
with full_text as (
  select
    id,
    -- Note: ts_rank_cd is not indexable but will only rank matches of the where clause
    -- which shouldn't be too big
    row_number() over(order by ts_rank_cd(fts, websearch_to_tsquery(query_text)) desc) as rank_ix
  from
    documents
  where
    fts @@ websearch_to_tsquery(query_text)
  order by rank_ix
  limit least(match_count, 30) * 2
),
semantic as (
  select
    id,
    row_number() over (order by embedding <#> query_embedding) as rank_ix
  from
    documents
  order by rank_ix
  limit least(match_count, 30) * 2
)
select
  documents.*
from
  full_text
  full outer join semantic
    on full_text.id = semantic.id
  join documents
    on coalesce(full_text.id, semantic.id) = documents.id
order by
  coalesce(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
  coalesce(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight
  desc
limit
  least(match_count, 30)
$$;`)
  const embeddingData = await embedding({
    model: 'text-embedding-3-small',
    input,
  })
  const embeddingVector = embeddingData.data[0].embedding.slice(0, 512)
  await queryFunction(`insert into documents (content, embedding) values (
  '${input}',
  '[${embeddingVector}]'::vector(512));`)
  return new Response()
}
