import { timingSafeEqual } from "node:crypto";
import { attachDatabasePool } from "@neon/functions";
import { Hono, type Context } from "hono";
import { cosineDistance, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { postgresUrl } from "./connection.js";
import { createEmbedder } from "./embedding.js";
import {
  documentId,
  InputError,
  parsePatch,
  parsePut,
  parseSearch,
} from "./input.js";
import { searchResults } from "./search-results.js";
import { hybridSearchSql, keywordSearchSql } from "./search-sql.js";
import { chunks, documents } from "./schema.js";
import { chunkMarkdown } from "./chunking.js";
import { copyChunks, type EmbeddedChunk } from "./chunk-copy.js";

const apiKey = process.env.SEARCH_API_KEY;
if (!apiKey || apiKey.length < 32)
  throw new Error(
    "Set SEARCH_API_KEY to a random secret of at least 32 characters",
  );
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const pool = new Pool({
  connectionString: postgresUrl(process.env.DATABASE_URL),
  max: 5,
});
attachDatabasePool(pool);
const db = drizzle(pool);
const embed = createEmbedder();

// COPY and Drizzle writes must share one checked-out connection and transaction.
async function documentTransaction<T>(
  write: (tx: NodePgDatabase, client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await write(drizzle(client), client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function prepareChunks(content: string) {
  const parsed = chunkMarkdown(content);
  const prepared: EmbeddedChunk[] = [];
  for (let offset = 0; offset < parsed.length; offset += 32) {
    const batch = parsed.slice(offset, offset + 32);
    const vectors = await embed(
      batch.map((chunk) =>
        chunk.heading ? `${chunk.heading}\n\n${chunk.content}` : chunk.content,
      ),
    );
    prepared.push(
      ...batch.map((chunk, index) => ({
        ...chunk,
        chunkIndex: offset + index,
        embedding: vectors[index]!,
      })),
    );
  }
  return prepared;
}

async function saveDocument(
  id: string,
  content: string,
  metadata: Record<string, unknown>,
) {
  const prepared = await prepareChunks(content);
  return documentTransaction(async (tx, client) => {
    const rows = await tx
      .insert(documents)
      .values({ id, content, metadata })
      .onConflictDoUpdate({
        target: documents.id,
        set: { content, metadata, updatedAt: sql`now()` },
      })
      .returning();
    await tx.delete(chunks).where(eq(chunks.documentId, id));
    await copyChunks(client, id, prepared);
    return rows[0];
  });
}

function authorized(header: string | undefined): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(apiKey!);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

async function body(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new InputError("body must be valid JSON");
  }
}

const app = new Hono();

app.use("*", async (c, next) => {
  if (!authorized(c.req.header("Authorization")))
    return c.json({ error: "unauthorized" }, 401);
  await next();
});

app.onError((error, c) => {
  if (error instanceof InputError) return c.json({ error: error.message }, 400);
  console.error("Hybrid search request failed", error);
  return c.json({ error: "search service unavailable" }, 503);
});

app.get("/documents/:id", async (c) => {
  const id = documentId(c.req.param("id"));
  const rows = await db
    .select({
      id: documents.id,
      content: documents.content,
      metadata: documents.metadata,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .where(eq(documents.id, id));
  return rows[0] ? c.json(rows[0]) : c.json({ error: "not found" }, 404);
});

app.put("/documents/:id", async (c) => {
  const id = documentId(c.req.param("id"));
  const input = parsePut(await body(c));
  return c.json(await saveDocument(id, input.content, input.metadata));
});

app.patch("/documents/:id", async (c) => {
  const id = documentId(c.req.param("id"));
  const input = parsePatch(await body(c));
  const prepared =
    input.content === null ? null : await prepareChunks(input.content);
  const removedKeys = sql`ARRAY[${sql.join(
    input.removeMetadataKeys.map((key) => sql`${key}`),
    sql`, `,
  )}]::text[]`;
  const row = await documentTransaction(async (tx, client) => {
    const rows = await tx
      .update(documents)
      .set({
        ...(input.content === null ? {} : { content: input.content }),
        metadata: sql`(${documents.metadata} || ${JSON.stringify(input.metadata)}::jsonb) - ${removedKeys}`,
        updatedAt: sql`now()`,
      })
      .where(eq(documents.id, id))
      .returning();
    if (rows[0] && prepared !== null) {
      await tx.delete(chunks).where(eq(chunks.documentId, id));
      await copyChunks(client, id, prepared);
    }
    return rows[0];
  });
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

app.delete("/documents/:id", async (c) => {
  const id = documentId(c.req.param("id"));
  const rows = await db
    .delete(documents)
    .where(eq(documents.id, id))
    .returning({ id: documents.id });
  return rows.length ? c.body(null, 204) : c.json({ error: "not found" }, 404);
});

app.post("/search", async (c) => {
  const input = parseSearch(await body(c));
  if (input.mode === "keyword") {
    const { rows } = await db.execute(
      keywordSearchSql(input.query, input.filter, input.limit),
    );
    return c.json({ mode: input.mode, results: searchResults(rows) });
  }
  const queryVector = await embed(input.query, "query");
  if (input.mode === "vector") {
    const distance = cosineDistance(chunks.embedding, queryVector);
    const rows = await db
      .select({
        id: documents.id,
        chunkId: chunks.id,
        chunkIndex: chunks.chunkIndex,
        heading: chunks.heading,
        content: chunks.content,
        metadata: documents.metadata,
        updatedAt: documents.updatedAt,
        distance,
      })
      .from(chunks)
      .innerJoin(documents, eq(documents.id, chunks.documentId))
      .where(
        sql`${documents.metadata} @> ${JSON.stringify(input.filter)}::jsonb`,
      )
      .orderBy(distance, chunks.id)
      .limit(input.limit);
    return c.json({ mode: input.mode, results: searchResults(rows) });
  }
  const { rows } = await db.execute(
    hybridSearchSql(
      queryVector,
      input.query,
      input.filter,
      input.candidates,
      input.rrfK,
      input.limit,
    ),
  );
  return c.json({ mode: input.mode, results: searchResults(rows) });
});

export default app;
