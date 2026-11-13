# Semantic memory with pgvector

A semantic memory store that runs as a [Neon Function](https://neon.com/docs/compute/functions/overview) next to your database. It splits text into chunks, embeds each chunk with Neon AI Gateway, stores the vectors with `pgvector`, and recalls the closest chunks by cosine similarity.

- [`qwen3-embedding-0-6b`](https://neon.com/docs/ai-gateway/models/qwen3-embedding-0-6b) turns text into 1024-dimensional embeddings.
- [`pgvector`](https://neon.com/docs/extensions/pgvector) stores them in a `memory_chunks` table with an HNSW index for nearest-neighbor search.

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new pgvector-memory --slug pgvectormemory
```

The CLI writes `functions/pgvectormemory/index.ts` and declares `pgvectormemory` in `neon.ts`.

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

The first request creates the `vector` extension, the `memory_chunks` table, and its HNSW index.

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

`id` is optional. Without it, the function generates a UUID and returns it in the response:

```bash
curl -s -X POST "$URL/memory" \
  -H 'content-type: application/json' \
  -d '{"content":"The deploy freeze starts on December 20 and lifts on January 5."}'
```

```json
{
  "id": "0b8f0f4e-6a1f-4c2f-9c0e-2d5a1f7b3c91",
  "chunks": 1,
  "model": "qwen3-embedding-0-6b"
}
```

Save the id if you want to replace or forget the memory later. To test the recall search, add two unrelated memories:

```bash
curl -s -X POST "$URL/memory" -H 'content-type: application/json' \
  -d '{"id":"team-platform","content":"The platform team runs incident reviews on the first Tuesday of each month."}'

curl -s -X POST "$URL/memory" -H 'content-type: application/json' \
  -d '{"id":"office-berlin","content":"The Berlin office Wi-Fi password rotates every Monday morning."}'
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

Search for the chunks closest to a query:

```bash
curl -s -X POST "$URL/recall" \
  -H 'content-type: application/json' \
  -d '{"query":"When does Ada have her onboarding call?","limit":3}'
```

```json
{
  "query": "When does Ada have her onboarding call?",
  "model": "qwen3-embedding-0-6b",
  "matches": [
    {
      "id": "user-42",
      "chunk": 0,
      "content": "Ada prefers aisle seats. She switched from decaf to oat flat whites.\n\nHer onboarding call moved to Fridays at 10:00.",
      "score": 0.7144
    },
    {
      "id": "team-platform",
      "chunk": 0,
      "content": "The platform team runs incident reviews on the first Tuesday of each month.",
      "score": 0.3876
    },
    {
      "id": "0b8f0f4e-6a1f-4c2f-9c0e-2d5a1f7b3c91",
      "chunk": 0,
      "content": "The deploy freeze starts on December 20 and lifts on January 5.",
      "score": 0.3873
    }
  ]
}
```

`score` is cosine similarity, so higher is closer. The function always returns the closest rows, even when none of them is a good match, so the second and third results above are noise. Apply a score cutoff in your app and calibrate it on your own data: scores depend on the model and the content, and unrelated chunks here still score around 0.39. Weak matches are close together, so their order shifts slightly between runs.

A different question surfaces a different memory:

```bash
curl -s -X POST "$URL/recall" \
  -H 'content-type: application/json' \
  -d '{"query":"How do I get on the guest network in Berlin?","limit":1}'
```

```json
{
  "query": "How do I get on the guest network in Berlin?",
  "model": "qwen3-embedding-0-6b",
  "matches": [
    {
      "id": "office-berlin",
      "chunk": 0,
      "content": "The Berlin office Wi-Fi password rotates every Monday morning.",
      "score": 0.6348
    }
  ]
}
```

`limit` defaults to 5 and accepts 1-20. Raise it to search more of the store.

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
| `GET` | `/` | — | The model, dimensions, and route list |
| `POST` | `/memory` | `{ "id"?: string, "content": string }` | The memory id and number of chunks stored |
| `POST` | `/recall` | `{ "query": string, "limit"?: number }` | Closest chunks, best first |
| `DELETE` | `/memory?id=...` | — | The memory id and number of chunks deleted |

</Operations>

`content` is limited to 20,000 characters, `query` to 2,000, and `id` to 200.

## Errors

| Status | Meaning |
| --- | --- |
| `400` | The body is not JSON or exceeds 128 KB, a field fails validation, or `DELETE /memory` has no valid `id`. |
| `404` | The memory to delete does not exist, or the path does not match a route. |
| `405` | The method is not allowed for that path. |
| `502` | AI Gateway rejected the embedding request, including on a rate limit or the daily spend cap, or returned a malformed vector. |
| `503` | `NEON_AI_GATEWAY_BASE_URL` or `NEON_AI_GATEWAY_TOKEN` is unset, or a database query failed. |

## Public URL

After the first deploy from [Scaffold it](#scaffold-it), `neon functions get` prints the function's public URL, where the same routes work:

```bash
neon functions get pgvectormemory
```

## How it works

`POST /memory` splits the text into chunks of at most 1,000 characters, preferring blank-line boundaries and then word boundaries. It sends every chunk to AI Gateway in one embeddings request, then upserts each row by `(memory_id, chunk_index)` in a single transaction:

```sql
INSERT INTO memory_chunks (memory_id, chunk_index, content, embedding)
VALUES ($1, $2, $3, $4::vector)
ON CONFLICT (memory_id, chunk_index) DO UPDATE SET
  content = EXCLUDED.content,
  embedding = EXCLUDED.embedding,
  created_at = now();
```

Chunks left over from a longer previous version of the same memory are deleted in the same transaction.

`POST /recall` embeds the query with Qwen's retrieval instruction (`Instruct: Given a search query, retrieve relevant passages that answer the query\nQuery: `) and runs a cosine distance search:

```sql
SELECT memory_id, chunk_index, content,
       1 - (embedding <=> $1::vector) AS score
FROM memory_chunks
ORDER BY embedding <=> $1::vector
LIMIT $2;
```

The HNSW index serves the `ORDER BY`, so the search does not scan every row. The index is approximate: it examines a bounded candidate list per query, so a result can miss a closer row. Raise `hnsw.ef_search` (default 40) when recall matters more than latency.

## Notes

- **No authentication.** Function URLs are public, so anyone with the URL can read every stored memory through `/recall`, write or replace memories, and spend AI Gateway credits. Ids are labels, not access control, and the table has no per-user isolation. Check a bearer token or add [Managed Better Auth](https://neon.com/docs/auth/overview) before you expose the function.
- **Model and dimensions.** `EMBEDDING_MODEL` and `EMBEDDING_DIMENSIONS` are constants at the top of `functions/pgvectormemory/index.ts`. The three embedding models on AI Gateway all return 1024 dimensions, and `qwen3-embedding-0-6b` can return shorter vectors through the `dimensions` parameter. A different width needs a different column type and index: change both constants, alter or recreate the `embedding` column, rebuild the index, and re-embed every row. The function rejects any embedding whose length isn't `EMBEDDING_DIMENSIONS`.
- **Query instruction.** Only queries carry the Qwen task instruction, taken from the model's own `query` prompt; stored chunks are embedded with the empty `document` prompt. That asymmetry is what the model expects, and prefixing documents would mean re-embedding every row. Changing `QUERY_INSTRUCTION` only affects new queries, so existing rows stay valid; switching models still means re-embedding everything.
- **Tune chunking.** Change `CHUNK_CHARS` to trade context size for recall precision. The template doesn't overlap chunks, so a fact split across a boundary can be harder to retrieve.
- **Use migrations in production.** Creating the schema on first use is a quick-start shortcut. Use a migration tool such as [Drizzle](https://neon.com/docs/guides/drizzle) or [Prisma](https://neon.com/docs/guides/prisma) for ongoing changes.
