# Project Structure

```
├── app/
│   ├── api/
│   │   ├── search/route.ts    # Hybrid search API (fuzzy + semantic)
│   │   └── stats/route.ts     # Query statistics from pg_stat_statements
│   ├── page.tsx               # Search UI
│   ├── layout.tsx             # Root layout with theme provider
│   └── globals.css            # Tailwind styles
├── components/
│   ├── ui/                    # shadcn/ui components
│   ├── about-section.tsx      # Expandable "How it works" section
│   ├── latency-notice.tsx     # Network latency explanation
│   ├── result-cards.tsx       # Individual result card components
│   ├── score-distribution.tsx # Score visualization charts
│   ├── search-results.tsx     # Main results container
│   └── theme-toggle.tsx       # Dark/light mode toggle
├── lib/
│   ├── batch-embedding.ts     # Batch embedding generation logic
│   ├── db.ts                  # Neon connection helper
│   ├── embedding-strategies.ts # Embedding content strategies
│   ├── embeddings.ts          # Transformers.js wrapper
│   ├── normalize.ts           # Text normalization for fuzzy
│   └── utils.ts               # Tailwind cn() helper
├── scripts/
│   ├── setup.ts               # Database setup (no embeddings)
│   ├── embed.ts               # Embedding generation (separate step)
│   ├── reset.ts               # Clear all embeddings
│   └── query.ts               # Debug queries with EXPLAIN
├── docs/                      # Documentation
└── package.json
```

## Key Files

### `app/api/search/route.ts`
Runs fuzzy (pg_trgm) and semantic (pgvector) searches in parallel, combines results using Reciprocal Rank Fusion (RRF).

### `lib/embeddings.ts`
Wraps Transformers.js with the `Xenova/gte-small` model (384 dimensions). Caches the pipeline to avoid reloading.

### `lib/normalize.ts`
Text normalization for fuzzy matching. Removes noise patterns, strips articles, handles punctuation.

### `scripts/setup.ts`
Database setup: creates table, imports Netflix data, builds indexes. Fuzzy search works immediately after setup.

### `scripts/embed.ts`
Generates embeddings for semantic search. Supports strategies (minimal/basic/rich) and is resumable if interrupted.
