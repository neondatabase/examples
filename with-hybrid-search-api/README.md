# Hybrid search API

A thin HTTP API on [Neon Functions](https://neon.com/docs/compute/functions/overview) for writing documents and retrieving relevant content. Applications, scripts, and agents can call it. It stores text, flexible JSONB metadata, and a 1024-dimensional embedding in one Postgres row. The [Neon AI Gateway](https://neon.com/docs/ai-gateway/embeddings) embeds text with `qwen3-embedding-0-6b`. [Lakebase Search](https://neon.com/docs/ai/lakebase-search-get-started) provides vector search and full-text search with BM25 ranking. The default hybrid mode combines those two ranked result sets with reciprocal rank fusion (RRF).

This is a single-tenant starter. Client-facing endpoints require one service API key; Neon trigger routes verify the trigger delivery instead. Put authorization and tenant scoping into the service before sharing it across customers. Do not expose a database URL or gateway token to clients.

## Why a Function?

Neon already has a [PostgREST-compatible Data API](https://neon.com/docs/data-api/overview) for HTTP CRUD. This example adds a small application layer because it must embed both writes and queries, validate input, control what callers may update, and fuse two retrieval methods. The Data API remains useful for existing PostgREST/Supabase clients; this service provides one purpose-built search contract.

## Setup

Requires a Neon project on Postgres 16+ in a region with Functions and Object Storage, Neon CLI 4.21+, Node.js 24, and AI Gateway access to `qwen3-embedding-0-6b`. Foundation model access may require a paid plan. The supported regions and model catalog can change; check the [Functions guide](https://neon.com/docs/compute/functions/get-started) and your branch's AI Gateway model access.

```bash
npx degit neondatabase/examples/with-hybrid-search-api ./with-hybrid-search-api
cd with-hybrid-search-api
npm install
neon link --no-env-pull
```

Create `.env.local` and add `SEARCH_API_KEY` as a random secret of at least 32 characters. Do not copy `.env.example` over an existing `.env.local`. The first link skips env pull because the bucket and triggers have not been provisioned on a new branch yet. Deploy the Function, AI Gateway, private Object Storage bucket, and both triggers declared in `neon.ts`, then pull the database URL and apply the schema:

```bash
npm run deploy
neon env pull
npm run db:setup
npm run dev
```

Both document writes and vector or hybrid queries call the AI Gateway. Check that the branch serves `qwen3-embedding-0-6b` and returns 1024-dimensional vectors before loading a corpus. If you change the model, re-embed existing rows and update the vector dimensions and index.

`npm run db:setup` applies the checked-in Drizzle migrations over `DATABASE_URL_UNPOOLED`. The first migration enables `lakebase_vector` and `lakebase_text`; the second creates `search_documents` and its vector, full-text BM25, and JSONB indexes. Drizzle's [schema](./src/schema.ts) declares both Lakebase custom index methods, including `lakebase_bm25`. CRUD, trigger reads, and vector retrieval use Drizzle's query builder. BM25 ranking and reciprocal rank fusion use bound SQL expressions through Drizzle because those operators have no query-builder helper. Do not use `drizzle-kit push` for this template; apply migrations so index creation order is explicit.

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

The result includes document IDs, text, metadata, and ISO `updatedAt` timestamps. Vector mode adds `distance`, keyword mode adds `bm25Score`, and hybrid mode adds numeric `vectorRank`, `keywordRank`, and fused `score`. A caller can use the stable ID with `GET /documents/:id` to retrieve a full record or cite it in an answer. The service returns search results; the caller decides how to use them.

## API

| Method and path         | Body                                                                                                                                           | Effect                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUT /documents/:id`    | `{ "content": string, "metadata"?: object }`                                                                                                   | Create or replace a document. Generate an embedding, then upsert text, metadata, and vector in one statement.                                                                    |
| `PATCH /documents/:id`  | `{ "content"?: string, "metadata"?: object, "removeMetadataKeys"?: string[] }`                                                                 | Change text and/or merge top-level metadata keys. Text changes regenerate the vector; metadata-only changes do not. `removeMetadataKeys` removes top-level fields after merging. |
| `GET /documents/:id`    | None                                                                                                                                           | Return text and metadata.                                                                                                                                                        |
| `DELETE /documents/:id` | None                                                                                                                                           | Delete the row.                                                                                                                                                                  |
| `POST /search`          | `{ "query": string, "filter"?: object, "mode"?: "hybrid" \| "vector" \| "keyword", "limit"?: number, "candidates"?: number, "rrfK"?: number }` | Return ranked documents. `filter` uses JSONB containment and is applied to both retrievers.                                                                                      |

Zod validates URL IDs and JSON request bodies before database work. Malformed JSON, invalid fields, and unknown top-level fields return HTTP 400; numeric strings are not coerced into numbers. IDs are caller supplied and URL safe. `PUT` replaces the entire document, including metadata. `PATCH` merges only top-level metadata fields; use `removeMetadataKeys` to delete them. To change a nested JSON object, replace that top-level field. No endpoint accepts arbitrary SQL, table names, column names, vectors, or a caller-selected embedding model.

The `keyword` mode runs full-text search with BM25 ranking and skips embedding. Both keyword mode and the keyword candidates in hybrid mode let BM25 rank partial term matches; there is no additional all-terms `plainto_tsquery` filter. For example, `postgres branching` can retrieve a document mentioning only `branching`. Metadata filters still apply. `vector` and `hybrid` embed the query once. The hybrid mode fuses vector and BM25 ranks. Defaults are `limit=10`, `candidates=40` per retriever, and `rrfK=60`; the API bounds the requested values. Hybrid candidate queries use `FETCH FIRST ... ROWS WITH TIES`, so all documents tied at the boundary enter RRF with the same rank. `candidates` is a soft bound: large tie groups can increase retrieval work beyond the requested count. Search uses the same embedding model for documents and queries. Qwen query embeddings prepend `Instruct: Given a search query, retrieve relevant documents that answer the query` followed by `Query: <query>` on the next line. Document embeddings remain unprefixed, and BM25 receives the original query. This follows Qwen's [task-specific query prompt convention](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B/blob/main/config_sentence_transformers.json). Each document write commits text and vector together. The external embedding call happens before that statement, so an embedding failure does not create a half-indexed row. A successful embedding followed by a database failure still incurs one inference call; synchronous HTTP cannot make the gateway and Postgres a distributed transaction.

For example, update a flexible field without re-embedding:

```bash
curl -sS -X PATCH "$BASE_URL/documents/guide-1" \
  -H "Authorization: Bearer $SEARCH_API_KEY" -H 'Content-Type: application/json' \
  -d '{"metadata":{"reviewed":true},"removeMetadataKeys":["topic"]}'
```

## Neon triggers

[Function Triggers](https://neon.com/docs/compute/functions/triggers/overview) currently support `storage_object_created` for a Neon Object Storage bucket and `schedule` for a UTC cron expression. This example declares both in `neon.ts`:

- `search-file-uploaded` receives uploads under `searchfiles/documents/`. It indexes UTF-8 `.txt`, `.md`, and `.mdx` files up to 80 KB and 20,000 characters. The source object key maps to a stable document ID, and its S3 ETag prevents re-embedding an unchanged file on repeated delivery.
- `search-file-reconcile` runs hourly. It lists the same prefix, compares ETags with indexed rows, indexes files missed or changed since the upload trigger, and removes rows whose source objects were deleted. The starter handles up to 1,000 listed objects and 1,000 indexed object rows per pass; it fails clearly if either bound is exceeded. A larger corpus needs pagination and a bounded batch design.

Upload a small text file to the branch's private bucket after deployment:

```bash
printf 'Neon branches isolate data and Functions together.\n' > sample.md
neon buckets object put searchfiles/documents/sample.md --file sample.md --content-type text/markdown
```

The storage trigger invokes the **deployed** Function, then the document becomes searchable. Delivery can lag the upload; use the synchronous document API when a caller needs read-after-write. Trigger routes use Neon's `X-Neon-Trigger-Invocation-Id` delivery check and do not accept the client API key. A normal public client cannot forge that header through the deployed Functions proxy. To exercise the handlers against `neon dev`, upload the object and replay a trigger payload locally:

```bash
curl -sS -X POST http://localhost:8787/triggers/object-created \
  -H 'Content-Type: application/json' -H 'X-Neon-Trigger-Invocation-Id: local-upload' \
  -d '{"version":1,"invocation_id":"local-upload","trigger":{"type":"storage_object_created","id":"trigger-local","name":"search-file-uploaded"},"data":{"bucket_name":"searchfiles","object_key":"documents/sample.md"}}'

curl -sS -X POST http://localhost:8787/triggers/reconcile \
  -H 'Content-Type: application/json' -H 'X-Neon-Trigger-Invocation-Id: local-cron' \
  -d '{"version":1,"invocation_id":"local-cron","trigger":{"type":"schedule","id":"trigger-local","name":"search-file-reconcile"},"data":{"scheduled_at":"2026-09-28T00:00:00Z"}}'
```

The object-created event does not fire on deletion. Scheduled reconciliation verifies missing objects and removes their indexed rows on its next run; callers needing immediate removal can use `DELETE /documents/:id`. If an indexed object is replaced with an empty, oversized, invalid UTF-8, or otherwise unsupported file, the upload handler or scheduled reconciliation removes its old search row. This starter does not extract PDFs or images; add extraction and chunking before embedding those formats. Upload ingestion is event-driven, so callers needing read-after-write should use `PUT /documents/:id` and wait for its synchronous response.

## Embedding and retrieval UX

The API stays synchronous so callers receive success or failure in the same call. This fits short text documents and small batches. Long PDFs, images, or large backfills need extraction and chunking before this endpoint, plus an idempotent batch or job workflow if a request can exceed the caller's deadline. The stable ID lets a caller retry `PUT`; the current API recomputes an embedding on each retry. A production variant can add a content hash to avoid that cost.

This API contains no agent tool-selection, planning, or memory module. Before tuning its retrieval, measure the three `mode` values on representative queries. Keep a judged set of queries with expected document IDs, including exact identifiers and paraphrases. Compare recall@5 and p95 latency for vector search, full-text search with BM25 ranking, and their hybrid fusion; vary `candidates` (20, 40, 80) and `rrfK` (20, 60, 100). Keep the simplest mode that improves retrieval on that set. Add a reranker only if the gain justifies another call and more latency. JSONB filters should come from trusted caller context, and any future tenant identity must be enforced by the service on both candidate queries rather than accepted solely from the request body.

## Validate

```bash
npm run check
npm test
npm run fmt
```

For a live check, run the local server against a Neon development branch and exercise the write/search/PATCH/delete flow above. Deploy and repeat against `npm run endpoint`, then upload a text file and verify the storage and hourly reconciliation triggers. The repository's [agent guide](../AGENTS.md) describes the full `neon bootstrap` smoke workflow for catalog templates.

While `npm run dev` is running, `npm run smoke:storage` uploads a temporary file, replays the upload trigger locally, replaces the file with invalid UTF-8 and then empty content, and checks that its stale search row is removed. It deletes the temporary object afterward.
