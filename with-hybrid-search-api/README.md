# Hybrid search API

A [Hono](https://hono.dev) API on [Neon Functions](https://neon.com/docs/compute/functions/overview) for storing Markdown documents and searching their chunks. It uses Drizzle, [Neon AI Gateway](https://neon.com/docs/ai-gateway/embeddings) embeddings, and [Lakebase Search](https://neon.com/docs/ai/lakebase-search-get-started) to combine vector search and BM25-ranked full-text search.

## Setup

Requires Node.js 24, Neon CLI 6.2.3+, and a Neon project on Postgres 16+ with Functions and AI Gateway access to `qwen3-embedding-0-6b` and `typesafeai-jev-1-14-0`. AI Gateway requires a paid plan and prepaid credits.

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

Use `db:setup` rather than `drizzle-kit push`; the migration also installs the required Lakebase extensions.

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

Search defaults to hybrid mode, combining vector search and BM25-ranked full-text search, using reciprocal rank fusion (RRF) in SQL to select a shortlist. [Jev](https://neon.com/docs/ai-gateway/decisions) reranks that shortlist before the final result limit. Set `mode` to `vector` for vector search only, or `keyword` for BM25-ranked full-text search only. Both modes skip reranking; `keyword` mode makes no AI Gateway call.

Results contain chunks with heading context, metadata, and the parent document `id`. `limit` counts chunks, so several hits can belong to one document. Use `GET /documents/:id` for the full document.

## API

All endpoints require `Authorization: Bearer <SEARCH_API_KEY>`.

| Endpoint                | JSON body                                                                                                                                      | Behavior                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `PUT /documents/:id`    | `{ "content": string, "metadata"?: object }`                                                                                                   | Create or replace a document and its chunks.                                                     |
| `PATCH /documents/:id`  | `{ "content"?: string, "metadata"?: object, "removeMetadataKeys"?: string[] }`                                                                 | Update content or merge/remove top-level metadata fields. Metadata-only changes do not re-embed. |
| `GET /documents/:id`    | —                                                                                                                                              | Return the full document.                                                                        |
| `DELETE /documents/:id` | —                                                                                                                                              | Delete the document and all its chunks.                                                          |
| `POST /search`          | `{ "query": string, "mode"?: "hybrid" \| "vector" \| "keyword", "filter"?: object, "limit"?: number, "candidates"?: number, "rrfK"?: number }` | Return ranked chunks. `filter` matches JSONB metadata fields.                                    |

Search defaults: `limit=10`, `candidates=40` per retriever and for the fused shortlist, and `rrfK=60` for RRF fusion. Invalid input returns HTTP 400.

Hybrid responses identify the `reranker` as `"jev"` or `"rrf"`. Both return the same result fields without scores or probabilities. Results are ordered from most to least relevant.

Non-retryable Jev errors return the shortlist in its RRF order. Retryable errors get up to two retries per batch within a shared 15-second deadline. Retry exhaustion or timeout returns HTTP 503.

## MCP

Connect an MCP client using Streamable HTTP to `<BASE_URL>/mcp` and set the `Authorization: Bearer <SEARCH_API_KEY>` header. For clients supporting URL and header configuration:

```json
{
  "url": "http://localhost:8787/mcp",
  "headers": { "Authorization": "Bearer <SEARCH_API_KEY>" }
}
```

The read-only `search_documents` tool uses the same arguments, ranking behavior, and response fields as `POST /search`. Search failures are returned as MCP tool errors. Requests are stateless; no session ID is needed. Use the deployed Function URL in place of the local URL after deployment.

## Notes

- Markdown documents are split into searchable chunks by heading. Documents with no searchable content return HTTP 400.
- Embeddings use `qwen3-embedding-0-6b` with 1024 dimensions. Re-embed documents when changing models, and keep the vector schema dimensions in sync.
- After many document updates or deletes, run `npm run db:refresh` for [full-text index maintenance](https://neon.com/docs/extensions/lakebase-text#keep-the-index-accurate).
- Highly selective metadata filters can return fewer full-text matches than requested. See the [full-text search reference](https://neon.com/docs/extensions/lakebase-text) for tuning.

This starter uses one shared service key. Add user authorization and tenant scoping before sharing it across customers.

## Deploy

Stop the local server, then deploy and get the Function URL:

```bash
npm run deploy
npm run endpoint
```

Repeat the requests above using the Function URL printed by `npm run endpoint` as `BASE_URL`.

## Checks

```bash
npm run check
npm test
```
