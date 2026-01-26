# Project Context

## Overview
A Next.js 15 demo app comparing PostgreSQL search methods:
- **Fuzzy search** using `pg_trgm` (trigram matching)
- **Semantic search** using `pgvector` (embedding similarity)
- **Hybrid search** using Reciprocal Rank Fusion (RRF)

Inspired by [Fuzzy and Semantic Search in PostgreSQL](https://rendiment.io/postgresql/2026/01/21/pgtrgm-pgvector-music.html) by Daniel Guzman Burgos.

## Dataset
- Netflix Shows (~8,807 records, ~11MB)
- Source: `https://raw.githubusercontent.com/neondatabase/postgres-sample-dbs/refs/heads/main/netflix.sql`
- Fits within Neon's 500MB free tier

## Key Technical Decisions

### Embedding Model
- **Model**: `Xenova/gte-small` (384 dimensions) via `@huggingface/transformers`
- **Why**: JavaScript-based, no API key needed, runs locally
- **Trade-off**: Slower than Python alternatives (~45 min for full dataset)

### Embedding Strategies
Three strategies available:
- `npm run embed:minimal`: Title only
- `npm run embed:basic`: Title + description
- `npm run embed:rich`: All fields (default, recommended)

### Normalization
Movie/TV-focused noise patterns (removed leading articles, years, quality markers, season/part numbers, etc.)

### Thresholds
- Fuzzy default: 20%
- Semantic default: 40%
- Semantic scores tend to cluster in 70-80% range (binary-ish behavior) - this is normal for embeddings

## Implemented Features
- Side-by-side comparison (Fuzzy | Semantic | Hybrid RRF)
- Query timing display
- Dark mode toggle
- Adjustable threshold sliders (debounced)
- Score distribution charts (Recharts)
- Query normalization info (shows when query was transformed)
- Example queries (categorized, expandable)
- Clear search (X button + ESC key)
- Resumable embed script (interrupt and continue where you left off)

## Useful Test Queries

**Fuzzy shines:**
- `"stranger things"`, `"strngr thngs"` (typos), `"breaking bad"`

**Semantic shines (with rich embeddings):**
- `"Korean thriller"` (country + genre)
- `"Adam Sandler comedy"` (cast + genre)
- `"Spielberg"` (director)
- `"shows about time travel"` (conceptual)

**Distribution testing:**
- `"love"`, `"dark"`, `"man"` (many partial matches at various scores)

## Scripts
```bash
npm run help            # Show all available commands
npm run setup           # Database setup (~1 min) - data import, indexes
npm run setup:full      # Setup + embed in one step (~20 min)
npm run embed           # Generate embeddings with rich strategy (default)
npm run embed:minimal   # Title only (fastest)
npm run embed:basic     # Title + description
npm run embed:rich      # All fields (best quality)
npm run embed:reset     # Clear all embeddings
npm run embed:help      # Show embedding options
npm run dev             # Start dev server
npm run test            # Run vitest tests
```

**Note:** Fuzzy search works immediately after `setup`. Semantic search requires `embed`.

## Known Quirks
1. Semantic scores cluster in 70-80% range regardless of query - threshold slider has limited effect
2. First search is slow (loads embedding model ~5s), subsequent searches are fast
3. DDL statements (CREATE INDEX) don't support parameterized queries - use `sql.query()` with string

## Performance Notes
- **Lazy embedding check**: The API only checks if embeddings exist when semantic search returns 0 results. This avoids an extra database query on every search. When results are found, we know embeddings exist.

## Tech Stack
- Next.js 15 (App Router)
- React 19
- Tailwind CSS 3.4
- shadcn/ui components
- Recharts for charts
- @neondatabase/serverless
- @huggingface/transformers
