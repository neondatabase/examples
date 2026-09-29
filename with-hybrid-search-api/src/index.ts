import { timingSafeEqual } from "node:crypto";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { attachDatabasePool } from "@neon/functions";
import { parseTriggerDelivery } from "@neon/functions/triggers";
import { Hono } from "hono";
import { and, cosineDistance, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
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
import { documents } from "./schema.js";
import {
  isSearchableObject,
  MAX_OBJECT_BYTES,
  MAX_RECONCILE_OBJECTS,
  objectDocumentId,
  SEARCH_BUCKET,
  SEARCH_PREFIX,
} from "./storage.js";

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
const storage = new S3Client({ forcePathStyle: true });

async function saveDocument(
  id: string,
  content: string,
  metadata: Record<string, unknown>,
) {
  const embedding = await embed(content);
  const rows = await db
    .insert(documents)
    .values({ id, content, metadata, embedding })
    .onConflictDoUpdate({
      target: documents.id,
      set: { content, metadata, embedding, updatedAt: sql`now()` },
    })
    .returning({
      id: documents.id,
      content: documents.content,
      metadata: documents.metadata,
      updatedAt: documents.updatedAt,
    });
  return rows[0];
}

async function removeIndexedObject(key: string) {
  await db.delete(documents).where(
    and(
      eq(documents.id, objectDocumentId(key)),
      sql`${documents.metadata} @> ${JSON.stringify({
        source: "neon-object-storage",
        bucket: SEARCH_BUCKET,
        objectKey: key,
      })}::jsonb`,
    ),
  );
}

async function indexObject(key: string, knownEtag?: string) {
  if (!isSearchableObject(key)) return "unsupported";
  const id = objectDocumentId(key);
  let object;
  try {
    object = await storage.send(
      new GetObjectCommand({ Bucket: SEARCH_BUCKET, Key: key }),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "NoSuchKey" || error.name === "NotFound")
    ) {
      await removeIndexedObject(key);
      return "missing";
    }
    throw error;
  }
  const etag = object.ETag ?? "";
  if (etag && knownEtag === etag) return "unchanged";
  if (!object.Body || (object.ContentLength ?? 0) > MAX_OBJECT_BYTES) {
    console.warn("Skipping missing or oversized search object", key);
    await removeIndexedObject(key);
    return "unsupported";
  }
  const bytes = await object.Body.transformToByteArray();
  if (bytes.byteLength > MAX_OBJECT_BYTES) {
    console.warn("Skipping oversized search object", key);
    await removeIndexedObject(key);
    return "unsupported";
  }
  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    console.warn("Skipping non-UTF-8 search object", key);
    await removeIndexedObject(key);
    return "unsupported";
  }
  let content: string;
  try {
    content = parsePut({ content: raw }).content;
  } catch (error) {
    if (error instanceof InputError) {
      await removeIndexedObject(key);
      return "unsupported";
    }
    throw error;
  }
  await saveDocument(id, content, {
    source: "neon-object-storage",
    bucket: SEARCH_BUCKET,
    objectKey: key,
    etag,
  });
  return "indexed";
}

async function reconcileObjects() {
  const listing = await storage.send(
    new ListObjectsV2Command({
      Bucket: SEARCH_BUCKET,
      Prefix: SEARCH_PREFIX,
      MaxKeys: MAX_RECONCILE_OBJECTS,
    }),
  );
  if (listing.IsTruncated) {
    throw new Error(
      "More than 1000 search objects; add pagination before enabling reconciliation",
    );
  }
  const rows = await db
    .select({ metadata: documents.metadata })
    .from(documents)
    .where(
      sql`${documents.metadata} @> ${JSON.stringify({ source: "neon-object-storage", bucket: SEARCH_BUCKET })}::jsonb`,
    )
    .limit(MAX_RECONCILE_OBJECTS + 1);
  if (rows.length > MAX_RECONCILE_OBJECTS) {
    throw new Error(
      "More than 1000 indexed search objects; add pagination before enabling reconciliation",
    );
  }
  const known = new Map<string, string>();
  for (const { metadata } of rows) {
    const key = metadata.objectKey;
    if (typeof key === "string" && isSearchableObject(key)) {
      known.set(key, typeof metadata.etag === "string" ? metadata.etag : "");
    }
  }
  const counts = { indexed: 0, unchanged: 0, unsupported: 0, missing: 0 };
  const seen = new Set<string>();
  for (const object of listing.Contents ?? []) {
    if (!object.Key) continue;
    const key = object.Key;
    seen.add(key);
    if (!isSearchableObject(key)) {
      counts.unsupported++;
      continue;
    }
    if (object.ETag && known.get(key) === object.ETag) {
      counts.unchanged++;
      continue;
    }
    counts[await indexObject(key, known.get(key))]++;
  }
  // A complete listing also lets us verify rows whose source object disappeared.
  for (const [key, etag] of known) {
    if (!seen.has(key)) counts[await indexObject(key, etag)]++;
  }
  return counts;
}

function authorized(header: string | undefined): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(apiKey!);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

async function body(c: {
  req: { json: () => Promise<unknown> };
}): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new InputError("body must be valid JSON");
  }
}

const app = new Hono();

app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/triggers/")) return next();
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
  const embedding = input.content === null ? null : await embed(input.content);
  const removedKeys = sql`ARRAY[${sql.join(
    input.removeMetadataKeys.map((key) => sql`${key}`),
    sql`, `,
  )}]::text[]`;
  const rows = await db
    .update(documents)
    .set({
      ...(input.content === null
        ? {}
        : { content: input.content, embedding: embedding! }),
      metadata: sql`(${documents.metadata} || ${JSON.stringify(input.metadata)}::jsonb) - ${removedKeys}`,
      updatedAt: sql`now()`,
    })
    .where(eq(documents.id, id))
    .returning({
      id: documents.id,
      content: documents.content,
      metadata: documents.metadata,
      updatedAt: documents.updatedAt,
    });
  return rows[0] ? c.json(rows[0]) : c.json({ error: "not found" }, 404);
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
  const queryVector = await embed(input.query);
  if (input.mode === "vector") {
    const distance = cosineDistance(documents.embedding, queryVector);
    const rows = await db
      .select({
        id: documents.id,
        content: documents.content,
        metadata: documents.metadata,
        updatedAt: documents.updatedAt,
        distance,
      })
      .from(documents)
      .where(
        sql`${documents.metadata} @> ${JSON.stringify(input.filter)}::jsonb`,
      )
      .orderBy(distance, documents.id)
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

app.post("/triggers/object-created", async (c) => {
  const parsed = await parseTriggerDelivery(c.req.raw);
  if (!parsed.ok) {
    return c.json(
      { error: parsed.error },
      parsed.error === "invalid_body" ? 400 : 401,
    );
  }
  const invocation = parsed.invocation;
  if (
    invocation.type !== "storage_object_created" ||
    invocation.trigger.name !== "search-file-uploaded" ||
    invocation.data.bucketName !== SEARCH_BUCKET
  ) {
    return c.json({ error: "unexpected trigger" }, 400);
  }
  const key = invocation.data.objectKey;
  if (!isSearchableObject(key)) return c.json({ status: "unsupported" });
  const rows = await db
    .select({ metadata: documents.metadata })
    .from(documents)
    .where(eq(documents.id, objectDocumentId(key)));
  const status = await indexObject(
    key,
    rows[0]?.metadata.etag as string | undefined,
  );
  return c.json({ status, id: objectDocumentId(key) });
});

app.post("/triggers/reconcile", async (c) => {
  const parsed = await parseTriggerDelivery(c.req.raw);
  if (!parsed.ok) {
    return c.json(
      { error: parsed.error },
      parsed.error === "invalid_body" ? 400 : 401,
    );
  }
  const invocation = parsed.invocation;
  if (
    invocation.type !== "schedule" ||
    invocation.trigger.name !== "search-file-reconcile"
  ) {
    return c.json({ error: "unexpected trigger" }, 400);
  }
  return c.json({ status: "ok", ...(await reconcileObjects()) });
});

export default app;
