# Hybrid search API

A [Hono](https://hono.dev) API on [Neon Functions](https://neon.com/docs/compute/functions/overview) for storing Markdown documents and searching their chunks. It uses Drizzle, [Neon AI Gateway](https://neon.com/docs/ai-gateway/embeddings) embeddings, and [Lakebase Search](https://neon.com/docs/ai/lakebase-search-get-started) to combine vector search and BM25-ranked full-text search.

## Setup

Requires Node.js 24, Neon CLI 6.2.3+, and a Neon project on Postgres 16+ with Functions and AI Gateway access to `qwen3-embedding-0-6b` and `typesafeai-jev-1-14-0`. AI Gateway requires a paid plan and prepaid credits. The Neon provider and AI SDK versions are pinned because the decision-model API is experimental.

```bash
npx degit neondatabase/examples/with-hybrid-search-api ./with-hybrid-search-api
cd with-hybrid-search-api
npm install
npm i -g neon
neon login
neon link
neon env pull
```

You can also scaffold with `neon bootstrap ./with-hybrid-search-api --template hybrid-search-api`.

Add a random `SEARCH_API_KEY` of at least 32 characters to the existing `.env.local`. Do not replace that file with `.env.example`; it already contains your database and AI Gateway credentials.

Apply the initial migration and start the local Function:

```bash
npm run db:setup
npm run dev
```

Use `db:setup`, rather than `drizzle-kit push`, to create the Lakebase extensions before the tables and indexes. Document writes batch chunks through binary COPY in the same transaction as the document update.

## Try it

In another shell, use the URL printed by `neon dev` and your API key:

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

Search defaults to hybrid mode, combining vector search and BM25-ranked full-text search, with [Jev reranking](https://neon.com/docs/ai-gateway/decisions) before the final result limit. Set `mode` to `vector` for vector search only, or `keyword` for BM25-ranked full-text search only. Both modes skip reranking; `keyword` mode makes no AI Gateway call.

Results contain chunk content, heading context, metadata, and the parent document `id`. Several hits can belong to one document; `limit` counts chunks. Use `GET /documents/:id` to retrieve the full document.

## API

All endpoints require `Authorization: Bearer <SEARCH_API_KEY>`.

| Endpoint                | JSON body                                                                                                                                      | Behavior                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `PUT /documents/:id`    | `{ "content": string, "metadata"?: object }`                                                                                                   | Create or replace a document and its chunks.                                                     |
| `PATCH /documents/:id`  | `{ "content"?: string, "metadata"?: object, "removeMetadataKeys"?: string[] }`                                                                 | Update content or merge/remove top-level metadata fields. Metadata-only changes do not re-embed. |
| `GET /documents/:id`    | —                                                                                                                                              | Return the full document.                                                                        |
| `DELETE /documents/:id` | —                                                                                                                                              | Delete the document and all its chunks.                                                          |
| `POST /search`          | `{ "query": string, "mode"?: "hybrid" \| "vector" \| "keyword", "filter"?: object, "limit"?: number, "candidates"?: number, "rrfK"?: number }` | Return ranked chunks. `filter` matches JSONB metadata fields.                                    |

Search defaults: `limit=10`, `candidates=40` per retriever, `rrfK=60`. BM25-ranked full-text search allows partial query-term matches and excludes zero-score chunks. Invalid input returns HTTP 400.

In hybrid mode, reciprocal rank fusion (RRF) merges the results of vector search and BM25-ranked full-text search, counting a chunk found by both searches once. It orders a shortlist of up to `min(2 * candidates, 80)` chunks for Jev and supplies the fallback order if reranking fails with a non-retryable error. RRF is this starter's shortlist and fallback strategy; Jev does not require it. Each retriever includes ties at its candidate cutoff, and the final result limit applies after Jev reranking.

Hybrid responses include `reranker: "jev"` or `"rrf"`. With Jev, each result includes `relevanceProbability`; ties retain RRF order. The existing `score` remains the RRF score: use the returned array order. Jev scores answer relevance, not answer completeness, and this starter does not apply a no-answer threshold.

Jev uses the original query, up to 256 heading characters and 2,000 content characters per chunk, with at most 16 candidates and 48,000 serialized UTF-8 bytes per batch. Each batch gets one initial attempt and up to two retries for retryable errors (at most three attempts per batch). A shared 15-second deadline covers all reranking batches and retries, so it can stop attempts earlier. Non-retryable errors (including unavailable models, invalid responses, or inputs exceeding the reranking budget) fall back to the RRF shortlist. Retry exhaustion or timeout returns HTTP 503 rather than silently changing ranking.

## Notes

- Markdown chunks follow heading sections and preserve code, tables, lists, quotes, and HTML blocks. The target is 4,096 characters; oversized blocks stay intact. YAML/TOML front matter stays in the full document but is excluded from search. Writes with no searchable content or more than 100 chunks return HTTP 400.
- Documents and queries use `qwen3-embedding-0-6b` with 1024 dimensions. Only query embeddings receive a [Qwen task instruction](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B/blob/main/config_sentence_transformers.json). Changing the model requires re-embedding documents and updating the vector schema.
- Embeddings use `neon.embeddingModel()` through the AI SDK, with at most 32 inputs and 80,000 characters per batch, sequential calls, two retries, and a shared 30-second deadline per document or query embedding operation. Invalid, non-finite, and all-zero vectors are rejected before storage or search. Embeddings complete before the document transaction starts.
- A newly built index already has up-to-date statistics for BM25-ranked full-text search. After many document updates or deletes, run `npm run db:refresh` to refresh those statistics with `VACUUM ANALYZE search_chunks` over the unpooled connection, outside a transaction. Regular autovacuum handles routine maintenance. See [full-text index maintenance](https://neon.com/docs/extensions/lakebase-text#keep-the-index-accurate). For a large corpus, also rebuild the vector index after loading so its automatic partition layout reflects the data.
- With highly selective metadata filters, BM25-ranked full-text search can return fewer matches than requested: its index candidate cap (`lakebase_bm25.default_limit`, default 1,000) applies before the parent-document filter. Raising the cap can help; the full-text index's prefilter alone cannot filter metadata on the parent table.

This starter uses one shared service key. Add user authorization and tenant scoping before sharing it across customers.

## Deploy

Stop the local server, then deploy and get the Function URL:

```bash
npm run deploy
npm run endpoint
```

Repeat the requests above using the Function URL printed by `npm run endpoint` as `BASE_URL`.

The bootstrap template ID is `hybrid-search-api`; the deployed Function slug and name are `search`. `neon functions get search` looks up that slug in the project and branch saved by `neon link` in `.neon`. The current deployment API does not propagate a separate display name from `neon.ts`.

## Checks

```bash
npm run check
npm test
```
