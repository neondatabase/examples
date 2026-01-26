# Performance Guide

This document explains performance characteristics, timing metrics, and optimization patterns for the hybrid search implementation.

## Understanding the Timing Display

Each search result column shows two timing values:

```
Fuzzy (pg_trgm)
235ms          ← Total round-trip time
50.0ms DB avg  ← Database execution time (from pg_stat_statements)
```

### Total Round-Trip Time

Measured in JavaScript using `performance.now()`. Includes:

- Network latency to Neon (both directions)
- TLS handshake / connection setup
- Database query execution
- Result serialization and transfer
- For semantic: embedding generation time (~200ms)

### DB Avg (pg_stat_statements)

The `mean_exec_time` from PostgreSQL's `pg_stat_statements` extension. This measures **only** the time PostgreSQL spends executing the query—no network, no embedding generation.

**Note:** This is a historical average across all calls, not the time for the current query.

---

## Performance Patterns

After warmup, you'll observe that **fuzzy and semantic have similar total times** despite very different DB execution times. This is because:

- **Fuzzy**: Slower DB query (~50ms+), no embedding overhead
- **Semantic**: Very fast DB query (<1ms with proper indexing), but ~200ms embedding generation

Network latency to Neon (typically 100-200ms depending on region) affects both equally.

> **Note:** Specific timing values vary significantly based on region, network conditions, compute state, and query complexity. The numbers shown in the UI are real measurements, but expect variation.

### Why Semantic DB Time is Faster

- **pgvector's IVFFlat** does approximate nearest neighbor search
- Pre-clusters vectors, only searches ~1-2% of data
- Simple dot product calculation (often SIMD-optimized)
- Fixed 384-float vectors = predictable memory access

### Why Fuzzy DB Time is Slower

- **`word_similarity()`** slides through text finding best substring match
- CPU-intensive character sequence comparisons
- Variable-length text fields (title + director + cast)

---

## Query Optimizations

### Fuzzy: Index-Aware Operators

The `%` and `<%` operators enable GIN index usage. Direct comparisons like `similarity(a, b) > 0.3` cannot use indexes.

```sql
-- Uses GIN index via operators
SELECT ..., word_similarity($query, search_text) AS score
FROM netflix_shows
WHERE $query <% search_text    -- word_similarity operator
   OR search_text % $query     -- similarity operator
```

**Key insight:** Use operators (`%`, `<%`) for filtering, functions (`word_similarity()`) for scoring.

### Semantic: Index-First Subquery

pgvector indexes only work with `ORDER BY embedding <=> vector`. Computed expressions in WHERE prevent index usage.

```sql
-- Optimized (~0.3ms): Index via ORDER BY
SELECT * FROM (
  SELECT ..., 1 - (embedding <=> $vector::vector) AS score
  FROM netflix_shows
  ORDER BY embedding <=> $vector::vector  -- Uses IVFFlat index!
  LIMIT 50
) candidates
WHERE score > $threshold
LIMIT 10

-- Naive (~35ms): Sequential scan
SELECT ... WHERE 1 - (embedding <=> $vector) > 0.4  -- Can't use index
```

### Index Summary

| Search | Index Type | Column |
|--------|------------|--------|
| Fuzzy | GIN with `gin_trgm_ops` | `search_text` (title + director + cast) |
| Semantic | IVFFlat with `vector_cosine_ops` | `embedding` (384 dimensions) |

---

## Cold Start Behavior

First request after inactivity is significantly slower (often 2-3x warm request times).

**Causes:**
- Neon compute waking from scale-to-zero
- PostgreSQL buffer cache is empty
- Transformers.js model loading on first use

Subsequent requests are faster as connections are cached and data is in memory.

---

## Optimization Options

### Reduce Network Latency
- **Deploy to same region as Neon** — Significant impact if currently cross-region
- **Edge deployment (Vercel Edge, Cloudflare)** — Reduces client-to-server latency

### Faster Embeddings
- **Use external embedding API (OpenAI, etc.)** — Trade local generation (~200ms) for API call (~50ms typical, requires API key)

### Reduce Cold Starts  
- **Keep Neon compute warm** — Configure minimum compute or use keep-alive pings
- **Connection pooling** — Already enabled via `DATABASE_URL_POOLER`

### Fuzzy Search Tradeoffs
- **Title-only matching** — Faster but less comprehensive results
- **HNSW index for semantic** — Marginal improvement (IVFFlat is already fast)

---

## Connection Optimization

### Connection Pooling

The app prefers `DATABASE_URL_POOLER` if set:

```bash
# .env
DATABASE_URL_POOLER=postgres://user:pass@ep-xxx-pooler.region.aws.neon.tech/db
DATABASE_URL=postgres://user:pass@ep-xxx.region.aws.neon.tech/db
```

### Connection Caching

The app enables connection caching on the Neon serverless driver:

```typescript
neon(connectionString, { fetchConnectionCache: true })
```

---

## Measuring Performance

### In the App

Column headers show per-request timing. "DB avg" comes from pg_stat_statements.

### Manual Queries

```sql
-- Check query stats
SELECT LEFT(query, 80), 
       round(mean_exec_time::numeric, 2) as mean_ms,
       calls
FROM pg_stat_statements 
WHERE query LIKE '%netflix%'
ORDER BY calls DESC 
LIMIT 10;

-- Reset stats for fresh measurements
SELECT pg_stat_statements_reset();

-- Check indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'netflix_shows';
```

### Debug Script

```bash
npx tsx scripts/query.ts "EXPLAIN ANALYZE SELECT ..."
```

---

## Summary

| Search | DB Time | Main Bottleneck |
|--------|---------|-----------------|
| Fuzzy | Moderate (tens of ms) | Network latency |
| Semantic | Very fast (<1ms with index) | Embedding generation |

The database queries are well-optimized with proper indexes. Total response time is dominated by:
1. **Network latency** — Deploy closer to Neon region
2. **Embedding generation** — ~200ms for local Transformers.js (external APIs are faster but require keys)
3. **Cold starts** — First request after inactivity is slower
