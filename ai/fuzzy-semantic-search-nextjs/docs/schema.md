# Database schema

## Table

```sql
CREATE TABLE netflix_shows (
  show_id text PRIMARY KEY,
  title text,
  type text,
  director text,
  cast_members text,
  country text,
  date_added date,
  release_year integer,
  rating text,
  duration text,
  listed_in text,
  description text,
  title_normalized text,        -- Cleaned title for fuzzy display
  search_text text GENERATED ALWAYS AS (
    LOWER(COALESCE(title, '') || ' ' || COALESCE(director, '') || ' ' || COALESCE(cast_members, ''))
  ) STORED,                     -- Fuzzy search: auto-maintained from source columns
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(listed_in, ''))
  ) STORED,                     -- Full-text search: auto-maintained from source columns
  embedding vector(384)         -- Semantic search: gte-small embeddings
);
```

## Extensions

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;            -- Fuzzy matching
CREATE EXTENSION IF NOT EXISTS vector;             -- Vector similarity
CREATE EXTENSION IF NOT EXISTS pg_stat_statements; -- Query performance stats
```

Full-text search (`tsvector`) is built into PostgreSQL and requires no extensions.

## Indexes

```sql
-- GIN index for trigram similarity (pg_trgm) on combined search_text
CREATE INDEX idx_netflix_search_text_trgm
ON netflix_shows USING gin (search_text gin_trgm_ops);

-- GIN index for full-text search on tsvector column
CREATE INDEX idx_netflix_search_vector
ON netflix_shows USING gin (search_vector);

-- IVFFlat index for vector similarity (pgvector)
CREATE INDEX idx_netflix_embedding
ON netflix_shows USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 93);  -- sqrt(8807) ~ 93
```

## Key columns

| Column | Purpose |
|--------|---------|
| `search_text` | Generated column: `LOWER(title + director + cast)` for fuzzy matching |
| `search_vector` | Generated column: `to_tsvector('english', title + description + genres)` for full-text search |
| `title_normalized` | Cleaned title for fuzzy display (JS-side normalization, not a generated column) |
| `embedding` | 384-dim vector from `gte-small` model for semantic search |
