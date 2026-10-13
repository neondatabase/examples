# Hybrid search API

A [Hono](https://hono.dev) API on [Neon Functions](https://neon.com/docs/compute/functions/overview) for storing Markdown documents and searching their chunks. It uses Drizzle, [Neon AI Gateway](https://neon.com/docs/ai-gateway/embeddings) embeddings, and [Lakebase Search](https://neon.com/docs/ai/lakebase-search-get-started) for vector search, BM25 keyword search, or both combined.

## Setup

Requires Node.js 24, Neon CLI 6.2.3+, and a Neon project on Postgres 16+ with Functions and AI Gateway access to `qwen3-embedding-0-6b`.

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

Search defaults to hybrid mode, combining vector and BM25 ranks with reciprocal rank fusion (RRF). Set `mode` to `vector` or `keyword` to use either alone; keyword search makes no AI Gateway call.

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

Search defaults: `limit=10`, `candidates=40` per retriever, `rrfK=60`. Hybrid retrieval includes ties at the candidate cutoff, then limits the final results. BM25 allows partial query-term matches and excludes zero-score chunks. Invalid input returns HTTP 400.

## Notes

- Markdown chunks follow heading sections and preserve code, tables, lists, quotes, and HTML blocks. The target is 4,096 characters; oversized blocks stay intact. YAML/TOML front matter stays in the full document but is excluded from search. Writes with no searchable content or more than 100 chunks return HTTP 400.
- Documents and queries use `qwen3-embedding-0-6b` with 1024 dimensions. Only query embeddings receive a [Qwen task instruction](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B/blob/main/config_sentence_transformers.json). Changing the model requires re-embedding documents and updating the vector schema.
- With highly selective metadata filters, BM25 can return fewer matches than requested: its index candidate cap (`lakebase_bm25.default_limit`, default 1,000) applies before the parent-document filter. Raising the cap can help; BM25 prefilter alone cannot filter metadata on the parent table.

This starter uses one shared service key. Add user authorization and tenant scoping before sharing it across customers.

## Deploy

Stop the local server, then deploy and get the Function URL:

```bash
npm run deploy
npm run endpoint
```

Repeat the requests above using the returned `invocation_url` as `BASE_URL`.

## Checks

```bash
npm run check
npm test
```
