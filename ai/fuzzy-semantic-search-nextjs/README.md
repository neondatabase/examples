# Fuzzy + Semantic Search with Neon

Search that actually works. Handles typos, synonyms, and natural language queries using PostgreSQL extensions.

## What It Does

- **Fuzzy matching** (`pg_trgm`) — "strngr thngs" finds "Stranger Things"
- **Semantic search** (`pgvector`) — "shows about time travel" finds relevant results
- **Hybrid approach** — tries fuzzy first, falls back to semantic when needed

Demo searches a Netflix dataset (~8,800 shows). No external AI APIs required — embeddings generated locally with [Transformers.js](https://huggingface.co/docs/transformers.js).

## Quick Start

1. [Create a Neon project](https://pg.new) (free tier is sufficient) — you'll need the connection string for `.env`

2. Clone and setup:
   ```bash
   npx degit neondatabase/examples/ai/fuzzy-semantic-search-nextjs ./fuzzy-semantic-search-nextjs
   cd fuzzy-semantic-search-nextjs
   npm install
   cp .env.example .env  # Add your DATABASE_URL
   npm run setup         # ~1 min - imports data, creates indexes
   npm run embed         # ~20 min - generates embeddings (optional)
   ```

3. Run:
   ```bash
   npm run dev
   ```

4. Open the URL shown in terminal and search!

> **Note:** Fuzzy search works immediately after `npm run setup`. Semantic search requires embeddings — skip `npm run embed` to try fuzzy search first, then add embeddings later.

## Why Neon?

[Neon](https://neon.com) is serverless Postgres with native support for `pg_trgm`, `pgvector`, and `pg_stat_statements` — extensions used in this demo. The free tier is plenty for this example.

- [pg_trgm docs](https://neon.com/docs/extensions/pg_trgm) — fuzzy text matching
- [pgvector docs](https://neon.com/docs/extensions/pgvector) — vector similarity search
- [pg_stat_statements docs](https://neon.com/docs/extensions/pg_stat_statements) — query performance stats

## Embedding Strategies

Choose how much context to include when generating embeddings:

```bash
npm run embed           # Default: rich strategy
npm run embed:minimal   # Title only (fastest)
npm run embed:basic     # Title + description
npm run embed:rich      # All fields (best quality)
npm run embed:reset     # Clear all embeddings
npm run embed:help      # Show all options
```

The `rich` strategy enables queries like "Korean thriller" or "Spielberg adventure" by including director, cast, genres, and country in the embeddings.

To change strategies: `npm run embed:reset && npm run embed:basic`

## Learn More

See [docs/](./docs/) for technical details, schema, and how the hybrid search works.

## Credits

Inspired by [Fuzzy and Semantic Search in PostgreSQL](https://rendiment.io/postgresql/2026/01/21/pgtrgm-pgvector-music.html) by Daniel Guzman Burgos.