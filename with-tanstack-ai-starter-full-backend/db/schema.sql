-- Schema for the image-search photo library.
-- Run once against your Neon branch (psql "$DATABASE_URL" -f db/schema.sql),
-- then seed and build the index (see README). Postgres 18, us-east-2.

create extension if not exists vector;
create extension if not exists lakebase_vector cascade;  -- lakebase_ann access method
create extension if not exists lakebase_text cascade;    -- lakebase_bm25 (used in the full build)

-- One row per photo. `embedding` is a normalized 512-d CLIP vector. Text queries
-- and images land in the same space, so one column serves both search shapes.
create table if not exists photos (
  id         text primary key,
  filename   text not null,               -- object key in the storage bucket
  width      int  not null default 0,
  height     int  not null default 0,
  embedding  vector(512) not null,
  caption    text,                         -- dataset ai.description, for display
  keywords   text,                         -- space-joined, for the BM25 mode later
  created_at timestamptz not null default now()
);

-- Caches text-query vectors so a repeated search never re-runs the model.
create table if not exists query_embeddings (
  query      text primary key,
  embedding  vector(512) not null,
  created_at timestamptz not null default now()
);

-- Build AFTER seeding (an ANN index over an empty table has no rows to partition):
--   create index photos_embedding_ann on photos
--   using lakebase_ann (embedding vector_cosine_ops) with (build_mode = 'standard');
-- `npm run index` in scripts/ does this for you.
