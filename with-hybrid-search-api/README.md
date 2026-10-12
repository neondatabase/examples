# Hybrid search API

A thin HTTP API on [Neon Functions](https://neon.com/docs/compute/functions/overview) for writing documents and retrieving relevant content. Applications, scripts, and agents can call it. It stores full documents and flexible JSONB metadata, then indexes Markdown chunks with a 1024-dimensional embedding per chunk. The [Neon AI Gateway](https://neon.com/docs/ai-gateway/embeddings) embeds text with `qwen3-embedding-0-6b`. [Lakebase Search](https://neon.com/docs/ai/lakebase-search-get-started) provides vector search and full-text search with BM25 ranking. The default hybrid mode combines those two ranked result sets with reciprocal rank fusion (RRF).

This is a single-tenant starter. All endpoints require one service API key. Put authorization and tenant scoping into the service before sharing it across customers. Do not expose a database URL or gateway token to clients.

## Why a Function?

Neon already has a [PostgREST-compatible Data API](https://neon.com/docs/data-api/overview) for HTTP CRUD. This example adds a small application layer because it must embed both writes and queries, validate input, control what callers may update, and fuse two retrieval methods. The Data API remains useful for existing PostgREST/Supabase clients; this service provides one purpose-built search contract.

## Setup

Requires a Neon project on Postgres 16+ in a region with Functions, Neon CLI 6.2.3+, Node.js 24, and AI Gateway access to `qwen3-embedding-0-6b`. Foundation model access may require a paid plan. The supported regions and model catalog can change; check the [Functions guide](https://neon.com/docs/compute/functions/get-started) and your branch's AI Gateway model access.

Scaffold with bootstrap:

```bash
neon bootstrap ./with-hybrid-search-api --template hybrid-search-api
cd with-hybrid-search-api
```

Alternatively, copy the template manually and link a project:

```bash
npx degit neondatabase/examples/with-hybrid-search-api ./with-hybrid-search-api
cd with-hybrid-search-api
npm install
neon link
```

For either scaffold method, pull the database and AI Gateway credentials:

```bash
neon env pull
```

Add `SEARCH_API_KEY` to the existing `.env.local` as a random secret of at least 32 characters. Do not copy `.env.example` over `.env.local`. Env pulls update Neon-managed variables and preserve your `SEARCH_API_KEY`. AI Gateway credentials can be pulled before deployment; `aiGateway: true` in `neon.ts` requests them without provisioning a separate service.

Apply the database schema and start the local Function:

```bash
npm run db:setup
npm run dev
```

After verifying the API locally, stop the dev server and deploy:

```bash
npm run deploy
npm run endpoint
```

Both document writes and vector or hybrid queries call the AI Gateway. Check that the branch serves `qwen3-embedding-0-6b` and returns 1024-dimensional vectors before loading a corpus. If you change the model, re-embed existing rows and update the vector dimensions and index.

`npm run db:setup` applies the checked-in Drizzle migrations over `DATABASE_URL_UNPOOLED`. The first migration enables `lakebase_vector` and `lakebase_text`; the second creates `search_documents` and its child `search_chunks` table. Vector and BM25 indexes belong to chunks; JSONB metadata belongs to the parent document. Drizzle's [schema](./src/schema.ts) declares both Lakebase custom index methods, including `lakebase_bm25`. CRUD and vector retrieval use Drizzle's query builder. BM25 ranking and reciprocal rank fusion use bound SQL expressions through Drizzle because those operators have no query-builder helper. Do not use `drizzle-kit push` for this template; apply migrations so index creation order is explicit.

The sample uses English full-text search and a fixed 1024-dimensional vector; changing the model or dimensions requires re-embedding rows and changing the vector column and index. The starter creates BM25 on an empty table so search works immediately. For a bulk import, load the initial corpus before building the indexes, then run `VACUUM` after a large load to refresh BM25 statistics.

In another shell, set `BASE_URL` to the local URL printed by `neon dev` or to the `invocation_url` from `npm run endpoint`, and send the API key:

```bash
export BASE_URL=http://localhost:8787
export SEARCH_API_KEY=your-secret-from-env-local
curl -sS -X PUT "$BASE_URL/documents/guide-1" \
  -H "Authorization: Bearer $SEARCH_API_KEY" -H 'Content-Type: application/json' \
  -d '{"content":"Neon branches isolate data and Functions together.","metadata":{"source":"docs","topic":"branching"}}'
curl -sS -X POST "$BASE_URL/search" \
  -H "Authorization: Bearer $SEARCH_API_KEY" -H 'Content-Type: application/json' \
  -d '{"query":"isolated branches","filter":{"source":"docs"},"limit":5}'
```

Search returns matched chunks with parent document `id`, `chunkId`, zero-based `chunkIndex`, heading context, chunk text, metadata, and ISO `updatedAt` timestamps. Several results may belong to the same document; `limit` counts chunks. Vector mode adds `distance`, keyword mode adds `bm25Score`, and hybrid mode adds numeric `vectorRank`, `keywordRank`, and fused `score`. A caller can use the stable ID with `GET /documents/:id` to retrieve the full document or cite it in an answer. Chunk IDs change when content is replaced; use the parent document ID for durable references. The service returns search results; the caller decides how to use them.

## API

| Method and path         | Body                                                                                                                                           | Effect                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUT /documents/:id`    | `{ "content": string, "metadata"?: object }`                                                                                                   | Create or replace a document and all its searchable chunks.                                                                                                                                  |
| `PATCH /documents/:id`  | `{ "content"?: string, "metadata"?: object, "removeMetadataKeys"?: string[] }`                                                                 | Change text and/or merge top-level metadata keys. Text changes replace all chunks and embeddings; metadata-only changes do not. `removeMetadataKeys` removes top-level fields after merging. |
| `GET /documents/:id`    | None                                                                                                                                           | Return text and metadata.                                                                                                                                                                    |
| `DELETE /documents/:id` | None                                                                                                                                           | Delete the document and cascade to all its chunks, embeddings, and full-text values.                                                                                                         |
| `POST /search`          | `{ "query": string, "filter"?: object, "mode"?: "hybrid" \| "vector" \| "keyword", "limit"?: number, "candidates"?: number, "rrfK"?: number }` | Return ranked chunks linked to their parent documents. `filter` uses JSONB containment and is applied to both retrievers.                                                                    |

Zod validates URL IDs and JSON request bodies before database work. Malformed JSON, invalid fields, and unknown top-level fields return HTTP 400; numeric strings are not coerced into numbers. Document whitespace is preserved, including indented code; queries are trimmed. IDs are caller supplied and URL safe. `PUT` replaces the entire document, including metadata. `PATCH` merges only top-level metadata fields; use `removeMetadataKeys` to delete them. To change a nested JSON object, replace that top-level field. No endpoint accepts arbitrary SQL, table names, column names, vectors, or a caller-selected embedding model.

The `keyword` mode runs full-text search with BM25 ranking and skips embedding. Both keyword mode and the keyword candidates in hybrid mode let BM25 rank partial term matches; there is no additional all-terms `plainto_tsquery` filter. For example, `postgres branching` can retrieve a document mentioning only `branching`. Both keyword paths require a negative BM25 score, excluding chunks with no query-term matches whether PostgreSQL uses the index or scores rows directly. Metadata filters still apply. `vector` and `hybrid` embed the query once. The hybrid mode fuses vector and BM25 ranks. Defaults are `limit=10`, `candidates=40` per retriever, and `rrfK=60`; the API bounds the requested values. Hybrid candidate queries use `FETCH FIRST ... ROWS WITH TIES`, so all chunks tied at the boundary enter RRF with the same rank. `candidates` is a soft bound: large tie groups can increase retrieval work beyond the requested count. Search uses the same embedding model for documents and queries. Qwen query embeddings prepend `Instruct: Given a search query, retrieve relevant documents that answer the query` followed by `Query: <query>` on the next line. Document embeddings remain unprefixed, and BM25 receives the original query. This follows Qwen's [task-specific query prompt convention](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B/blob/main/config_sentence_transformers.json). Markdown is parsed with `mdast-util-from-markdown`. Headings define sections, with parent headings retained as context. The parser recognizes GFM tables and leading YAML (`---`) or TOML (`+++`) front matter. Front matter stays in the full document but is excluded from searchable chunks and embeddings; a front-matter-only document produces no chunks. Code blocks, tables, lists, blockquotes, and HTML blocks stay intact even when they exceed the 4,096-character chunk target; only oversized prose paragraphs split at whitespace. Chunks never combine different heading sections, and a document producing more than 100 chunks is rejected before embedding. Heading context accompanies each document chunk sent to the Gateway; the Qwen task instruction still applies only to query embeddings. Document embeddings use batches of up to 32 chunks. Writes replace the parent content and all chunks in one transaction; metadata-only updates reuse existing chunks. Deleting a document cascades to all chunk rows.

For example, update a flexible field without re-embedding:

```bash
curl -sS -X PATCH "$BASE_URL/documents/guide-1" \
  -H "Authorization: Bearer $SEARCH_API_KEY" -H 'Content-Type: application/json' \
  -d '{"metadata":{"reviewed":true},"removeMetadataKeys":["topic"]}'
```

For large corpora with highly selective metadata filters, a BM25 index scan can return fewer keyword matches than requested. The index returns at most `lakebase_bm25.default_limit` candidates (1,000 by default) before applying the joined parent-document metadata filter. If eligible matches fall outside that cap, keyword mode can miss results and hybrid mode can miss keyword contributions. Increasing the cap mitigates this edge case; enabling BM25 prefilter alone does not help because metadata is stored on the parent documents.

## Embedding and retrieval UX

The API stays synchronous so callers receive success or failure in the same call. This fits short text documents and small batches. Long PDFs, images, or large backfills need extraction and chunking before this endpoint, plus an idempotent batch or job workflow if a request can exceed the caller's deadline. The stable ID lets a caller retry `PUT`; the current API recomputes chunk embeddings on each retry. A production variant can add a content hash to avoid that cost.

This API contains no agent tool-selection, planning, or memory module. Before tuning its retrieval, measure the three `mode` values on representative queries. Keep a judged set of queries with expected document IDs, including exact identifiers and paraphrases. Compare recall@5 and p95 latency for vector search, full-text search with BM25 ranking, and their hybrid fusion; vary `candidates` (20, 40, 80) and `rrfK` (20, 60, 100). Keep the simplest mode that improves retrieval on that set. Add a reranker only if the gain justifies another call and more latency. JSONB filters should come from trusted caller context, and any future tenant identity must be enforced by the service on both candidate queries rather than accepted solely from the request body.

## Validate

```bash
npm run check
npm test
npm run fmt
```

For a live check, run the local server against a Neon development branch and exercise the write/search/PATCH/delete flow above. Deploy and repeat against the invocation URL from `npm run endpoint`. The repository's [agent guide](../AGENTS.md) describes the full `neon bootstrap` smoke workflow for catalog templates.
