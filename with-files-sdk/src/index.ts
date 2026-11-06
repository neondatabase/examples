import {
  isStorageObjectCreatedTriggerInvocation,
  parseTriggerDelivery,
} from "@neon/functions/hono";
import { Hono } from "hono";
import { getDb } from "./db/client.js";
import { objects } from "./db/schema.js";

const db = getDb();

async function listFiles() {
  return db
    .select({
      bucket: objects.bucket,
      objectKey: objects.objectKey,
    })
    .from(objects);
}

async function indexObject(bucket: string, objectKey: string) {
  await db.insert(objects).values({ bucket, objectKey }).onConflictDoNothing();
}

const app = new Hono();

app.get("/", (c) =>
  c.text("Neon object ingest. GET /files, POST /object"),
);

app.get("/files", async (c) => c.json({ files: await listFiles() }));

app.post("/object", async (c) => {
  const parsed = await parseTriggerDelivery(c.req.raw);
  if (!parsed.ok) {
    const status = parsed.error === "invalid_body" ? 400 : 401;
    return c.json({ error: parsed.error }, status);
  }
  if (!isStorageObjectCreatedTriggerInvocation(parsed.invocation)) {
    return c.json({ error: "invalid_body" }, 400);
  }

  const { bucketName, objectKey } = parsed.invocation.data;
  await indexObject(bucketName, objectKey);
  console.info("[ingest]", {
    invocationId: parsed.invocation.invocationId,
    triggerName: parsed.invocation.trigger.name,
    bucketName,
    objectKey,
  });
  return c.json({
    bucket: bucketName,
    objectKey,
    invocationId: parsed.invocation.invocationId,
  });
});

export default app;
