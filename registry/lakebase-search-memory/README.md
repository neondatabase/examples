# Hybrid memory with Lakebase Search

A memory store for your app or agent that runs as a [Neon Function](https://neon.com/docs/compute/functions/overview) next to your database. It splits text into chunks, embeds each chunk with Neon AI Gateway, and recalls the closest chunks with [Lakebase Search](https://neon.com/docs/ai/lakebase-search): vector search for meaning, BM25 keyword search for exact terms, or both fused into one ranking.

- [`qwen3-embedding-0-6b`](https://neon.com/docs/ai-gateway/models/qwen3-embedding-0-6b) turns text into 1024-dimensional embeddings.
- [`lakebase_vector`](https://neon.com/docs/extensions/lakebase-vector) stores them in a `search_memory_chunks` table with a `lakebase_ann` index.
- [`lakebase_text`](https://neon.com/docs/extensions/lakebase-text) adds a `lakebase_bm25` index over the same chunks.

For a version that uses `pgvector` and HNSW only, see the [`pgvector-memory`](https://neon.com/functions/templates/pgvector-memory) template.

## Scaffold it

Lakebase Search requires Postgres 16 or later. Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new lakebase-search-memory --slug searchmemory
```

The CLI writes `functions/searchmemory/index.ts` and declares `searchmemory` in `neon.ts`.

Enable AI Gateway on the linked branch:

```bash
neon config add ai-gateway
```

You can also set `aiGateway: true` in `neon.ts`. AI Gateway requires prepaid credits and a project in a supported region. See the [AI Gateway quickstart](https://neon.com/docs/ai-gateway/get-started) and [prepaid credits](https://neon.com/docs/ai-gateway/prepaid-credits).

Deploy once so Neon provisions the gateway and pulls `DATABASE_URL`, `NEON_AI_GATEWAY_BASE_URL`, and `NEON_AI_GATEWAY_TOKEN` into `.env.local`:

```bash
neon deploy --env .env.local
```

## Run locally

```bash
neon dev
```

`neon dev` loads `.env.local` and prints the URL to call. The examples below use `$URL` for that URL.

The first request creates the `lakebase_vector` and `lakebase_text` extensions, the `search_memory_chunks` table, and both indexes.

### Remember

Store a memory under an id you choose:

```bash
curl -s -X POST "$URL/memory" \
  -H 'content-type: application/json' \
  -d '{
    "id": "user-42",
    "content": "Ada prefers aisle seats and decaf coffee.\n\nHer onboarding call is on Thursdays at 10:00."
  }'
```

```json
{
  "id": "user-42",
  "chunks": 1,
  "model": "qwen3-embedding-0-6b"
}
```

`id` is optional. Without it, the function generates a UUID and returns it in the response. Save the id if you want to replace or forget the memory later.

Add a few more memories to search, including one with an error code:

```bash
curl -s -X POST "$URL/memory" -H 'content-type: application/json' \
  -d '{"id":"team-platform","content":"The platform team runs incident reviews on the first Tuesday of each month."}'

curl -s -X POST "$URL/memory" -H 'content-type: application/json' \
  -d '{"id":"office-berlin","content":"The Berlin office Wi-Fi password rotates every Monday morning."}'

curl -s -X POST "$URL/memory" -H 'content-type: application/json' \
  -d '{"id":"runbook-payments","content":"If the payments worker logs error PAY-4417, restart it with systemctl restart payments-worker and page the on-call engineer."}'
```

Sending an existing `id` replaces that memory; the response's `chunks` field counts what it holds now:

```bash
curl -s -X POST "$URL/memory" \
  -H 'content-type: application/json' \
  -d '{
    "id": "user-42",
    "content": "Ada prefers aisle seats. She switched from decaf to oat flat whites.\n\nHer onboarding call moved to Fridays at 10:00."
  }'
```

### Recall

`mode` picks the search. It defaults to `hybrid`, which runs a vector search and a keyword search and fuses their rankings with Reciprocal Rank Fusion (RRF):

```bash
curl -s -X POST "$URL/recall" \
  -H 'content-type: application/json' \
  -d '{"query":"When does Ada have her onboarding call?","limit":3}'
```

```json
{
  "query": "When does Ada have her onboarding call?",
  "mode": "hybrid",
  "model": "qwen3-embedding-0-6b",
  "matches": [
    {
      "id": "user-42",
      "chunk": 0,
      "content": "Ada prefers aisle seats. She switched from decaf to oat flat whites.\n\nHer onboarding call moved to Fridays at 10:00.",
      "score": 0.032787,
      "vectorRank": 1,
      "keywordRank": 1
    },
    {
      "id": "runbook-payments",
      "chunk": 0,
      "content": "If the payments worker logs error PAY-4417, restart it with systemctl restart payments-worker and page the on-call engineer.",
      "score": 0.031514,
      "vectorRank": 5,
      "keywordRank": 2
    },
    {
      "id": "team-platform",
      "chunk": 0,
      "content": "The platform team runs incident reviews on the first Tuesday of each month.",
      "score": 0.016129,
      "vectorRank": 2,
      "keywordRank": null
    }
  ]
}
```

`vectorRank` and `keywordRank` show where each chunk placed in the two searches, or `null` when it wasn't among that search's top 40 candidates. Both searches put Ada's memory first. The runbook comes second only because "call" also appears in "on-call", which shows how a shared word lifts a weak match. Like vector search, hybrid search always returns its closest rows, so apply a cutoff in your app if it needs to say "no match."

Use `keyword` for exact terms such as names, ids, and error codes. It returns only chunks that contain a query term, and it makes no AI Gateway call:

```bash
curl -s -X POST "$URL/recall" \
  -H 'content-type: application/json' \
  -d '{"query":"PAY-4417","mode":"keyword"}'
```

```json
{
  "query": "PAY-4417",
  "mode": "keyword",
  "model": null,
  "matches": [
    {
      "id": "runbook-payments",
      "chunk": 0,
      "content": "If the payments worker logs error PAY-4417, restart it with systemctl restart payments-worker and page the on-call engineer.",
      "score": 1.3863
    }
  ]
}
```

A query with no matching words returns an empty `matches` array.

Use `vector` for meaning alone, the same search the `pgvector-memory` template runs:

```bash
curl -s -X POST "$URL/recall" \
  -H 'content-type: application/json' \
  -d '{"query":"How do I get on the guest network in Berlin?","mode":"vector","limit":1}'
```

`score` depends on the mode, so don't compare scores across modes:

| Mode | `score` | Order |
| --- | --- | --- |
| `hybrid` | RRF score, the sum of `1 / (60 + rank)` for each search the chunk appears in | Higher is better |
| `vector` | Cosine similarity | Higher is closer |
| `keyword` | BM25 relevance | Higher is better |

`limit` defaults to 5 and accepts 1-20.

### Forget

```bash
curl -s -X DELETE "$URL/memory?id=user-42"
```

```json
{ "id": "user-42", "chunksDeleted": 1 }
```

`chunksDeleted` counts every chunk of that memory.

## Routes

<Operations>

| Method | Route | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/` | None | The model, dimensions, recall modes, and route list |
| `POST` | `/memory` | `{ "id"?: string, "content": string }` | The memory id and number of chunks stored |
| `POST` | `/recall` | `{ "query": string, "limit"?: number, "mode"?: "hybrid" \| "vector" \| "keyword" }` | Closest chunks, best first |
| `DELETE` | `/memory?id=...` | None | The memory id and number of chunks deleted |

</Operations>

`content` is limited to 20,000 characters, `query` to 2,000, and `id` to 200.

## Errors

| Status | Meaning |
| --- | --- |
| `400` | The body is not JSON or exceeds 128 KB, a field fails validation, or `DELETE /memory` has no valid `id`. |
| `404` | The memory to delete does not exist, or the path does not match a route. |
| `405` | The method is not allowed for that path. |
| `502` | AI Gateway rejected the embedding request, including on a rate limit or the daily spend cap, or returned a malformed vector. |
| `503` | `NEON_AI_GATEWAY_BASE_URL` or `NEON_AI_GATEWAY_TOKEN` is unset for a request that needs an embedding, or a database query failed. |

## Public URL

After the first deploy from [Scaffold it](#scaffold-it), `neon functions get` prints the function's public URL, where the same routes work:

```bash
neon functions get searchmemory
```

## How it works

`POST /memory` splits the text into chunks of at most 1,000 characters, preferring blank-line boundaries and then word boundaries. It sends every chunk to AI Gateway in one embeddings request, then upserts each row by `(memory_id, chunk_index)` in a single transaction. Chunks left over from a longer previous version of the same memory are deleted in the same transaction.

The table keeps a generated `tsvector` column next to the embedding, so every write is searchable both ways as soon as it commits:

```sql
CREATE TABLE search_memory_chunks (
  memory_id text NOT NULL,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding vector(1024) NOT NULL,
  content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (memory_id, chunk_index)
);

CREATE INDEX search_memory_chunks_embedding_idx
  ON search_memory_chunks USING lakebase_ann (embedding vector_cosine_ops);

CREATE INDEX search_memory_chunks_bm25_idx
  ON search_memory_chunks USING lakebase_bm25 (content_tsv)
  WITH (default_limit = 40);
```

`POST /recall` embeds the query with Qwen's retrieval instruction (`Instruct: Given a search query, retrieve relevant passages that answer the query\nQuery: `), except in `keyword` mode. The keyword search orders by the `<@>` operator, which returns the negative BM25 score, and leaves out chunks that share no term with the query:

```sql
SELECT memory_id, chunk_index, content, -bm25 AS score
FROM (
  SELECT memory_id, chunk_index, content,
         content_tsv <@> to_bm25query(
           to_tsvector('english', $1), 'search_memory_chunks_bm25_idx'::regclass
         ) AS bm25
  FROM search_memory_chunks
) AS scored
WHERE bm25 < 0
ORDER BY bm25, memory_id, chunk_index
LIMIT $2;
```

Hybrid mode takes the top 40 chunks from each search, ranks each list, and adds `1 / (60 + rank)` from each list a chunk appears in. A chunk near the top of both lists beats one that ranks first in only one. The full query is `hybridSearch` in `functions/searchmemory/index.ts`.

## Notes

- **No authentication.** Function URLs are public, so anyone with the URL can read every stored memory through `/recall`, write or replace memories, and spend AI Gateway credits. Ids are labels, not access control, and the table has no per-user isolation. Check a bearer token or add [Managed Better Auth](https://neon.com/docs/auth/overview) before you expose the function.
- **Rebuild the vector index as the store grows.** The function creates the `lakebase_ann` index on an empty table, so it starts as an exact (flat) index and stays that way as rows arrive. That's accurate, and fast while the store is small. Once it holds many chunks, rebuild the index so `lakebase_ann` partitions it, then check the result: `lists` is `[]` for a flat index.

  ```sql
  REINDEX INDEX CONCURRENTLY search_memory_chunks_embedding_idx;
  SELECT lakebase_ann_index_info('search_memory_chunks_embedding_idx');
  ```

  See [Index tuning](https://neon.com/docs/extensions/lakebase-vector#index-tuning) for `probes` and the other search settings.
- **Keep BM25 statistics fresh.** `lakebase_bm25` updates its corpus statistics at `VACUUM`. Autovacuum handles normal writes; after a large bulk load, run `VACUUM search_memory_chunks`. See [Keep the index accurate](https://neon.com/docs/extensions/lakebase-text#keep-the-index-accurate).
- **Language.** The `tsvector` column and the keyword query both use the `english` text search configuration, which stems words and drops stop words. For another language, change both, or add [`lakebase_tokenizer`](https://neon.com/docs/extensions/lakebase-tokenizer) for Chinese, Japanese, and Korean text.
- **Tune the fusion.** `CANDIDATES` (40 per search) and `RRF_K` (60) are constants at the top of the module. More candidates let a chunk that ranks low in one search still surface through the other; a smaller `RRF_K` weights the top ranks more heavily. `CANDIDATES` also sets the BM25 index's `default_limit`, so if you raise it, run `ALTER INDEX search_memory_chunks_bm25_idx SET (default_limit = ...)` to match.
- **Model and dimensions.** `EMBEDDING_MODEL` and `EMBEDDING_DIMENSIONS` are constants at the top of the module. The three embedding models on AI Gateway all return 1024 dimensions. A different width needs a different column type and index: change both constants, alter or recreate the `embedding` column, rebuild the index, and re-embed every row. The function rejects any embedding whose length isn't `EMBEDDING_DIMENSIONS`.
- **Query instruction.** Only queries carry the Qwen task instruction; stored chunks are embedded without one, which is what the model expects. Changing `QUERY_INSTRUCTION` only affects new queries, so existing rows stay valid; switching models still means re-embedding everything.
- **Tune chunking.** Change `CHUNK_CHARS` to trade context size for recall precision. The template doesn't overlap chunks, so a fact split across a boundary can be harder to retrieve.
- **Use migrations in production.** Creating the schema on first use is a quick-start shortcut. Use a migration tool such as [Drizzle](https://neon.com/docs/guides/drizzle) or [Prisma](https://neon.com/docs/guides/prisma) for ongoing changes. Create the Lakebase extensions before the table and indexes.
