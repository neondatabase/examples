export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import { neon } from '@neondatabase/serverless'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: Request) {
  const { message: input } = await request.json()
  if (!input) return new Response(null, { status: 400 })
  const sql = neon(process.env.DATABASE_URL!)
  await sql`CREATE EXTENSION IF NOT EXISTS vector;`
  await sql`
  create table if not exists documents (
    id bigint primary key generated always as identity,
    content text,
    fts tsvector generated always as (to_tsvector('english', content)) stored,
    embedding vector(512)
  );`
  await sql`create index if not exists documents_fts_idx on documents using gin(fts);`
  await sql`create index if not exists documents_embedding_idx on documents using hnsw (embedding vector_ip_ops);`
  // ref: https://supabase.com/docs/guides/ai/hybrid-search#hybrid-search-in-postgres
  await sql`create or replace function hybrid_search(
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
$$;`
  const embeddingData = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input,
  })
  const embeddingVector = embeddingData.data[0].embedding.slice(0, 512)
  await sql`insert into documents (content, embedding) values (
  ${input},
  ${JSON.stringify(embeddingVector)}::vector(512));`
  return new Response()
}
