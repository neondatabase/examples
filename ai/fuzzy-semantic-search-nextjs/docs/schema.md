# Database Schema

## Table

```sql
CREATE TABLE netflix_shows (
  show_id text PRIMARY KEY,
  title text,
  type text,
  director text,
  cast_members text,
  country text,
  release_year integer,
  rating text,
  duration text,
  listed_in text,
  description text,
  title_normalized text,      -- For fuzzy matching
  embedding vector(384)       -- For semantic search
);
```

## Extensions

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;            -- Fuzzy matching
CREATE EXTENSION IF NOT EXISTS vector;             -- Vector similarity
CREATE EXTENSION IF NOT EXISTS pg_stat_statements; -- Query performance stats
```

## Indexes

```sql
-- GIN index for trigram similarity (pg_trgm)
CREATE INDEX idx_netflix_title_trgm 
ON netflix_shows USING gin (title_normalized gin_trgm_ops);

-- IVFFlat index for vector similarity (pgvector)
CREATE INDEX idx_netflix_embedding 
ON netflix_shows USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 93);  -- sqrt(8807) ≈ 93
```

## Key Columns

| Column | Purpose |
|--------|---------|
| `title_normalized` | Cleaned title for fuzzy matching (lowercase, no noise) |
| `embedding` | 384-dim vector from `gte-small` model for semantic search |
