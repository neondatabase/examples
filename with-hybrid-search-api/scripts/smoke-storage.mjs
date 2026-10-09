import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const baseURL = process.env.BASE_URL ?? "http://localhost:8787";
const apiKey = process.env.SEARCH_API_KEY;
if (!apiKey) throw new Error("SEARCH_API_KEY is required");

const storage = new S3Client({ forcePathStyle: true });
const key = `documents/smoke-${randomUUID()}.md`;
const id = `object:${createHash("sha256").update(key).digest("hex")}`;

async function document(method = "GET") {
  return fetch(new URL(`/documents/${id}`, baseURL), {
    method,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

async function deliverUpload() {
  const invocationId = randomUUID();
  const response = await fetch(new URL("/triggers/object-created", baseURL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Neon-Trigger-Invocation-Id": invocationId,
    },
    body: JSON.stringify({
      version: 1,
      invocation_id: invocationId,
      trigger: {
        type: "storage_object_created",
        id: "trigger-local",
        name: "search-file-uploaded",
      },
      data: { bucket_name: "searchfiles", object_key: key },
    }),
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result;
}

try {
  await storage.send(
    new PutObjectCommand({
      Bucket: "searchfiles",
      Key: key,
      Body: Buffer.from("A searchable smoke test document"),
      ContentLength: Buffer.byteLength("A searchable smoke test document"),
      ContentType: "text/markdown",
    }),
  );
  assert.match((await deliverUpload()).status, /^(indexed|unchanged)$/);
  assert.equal((await document()).status, 200);

  await storage.send(
    new PutObjectCommand({
      Bucket: "searchfiles",
      Key: key,
      Body: Buffer.from([0xff, 0xfe]),
      ContentLength: 2,
      ContentType: "text/markdown",
    }),
  );
  assert.equal((await deliverUpload()).status, "unsupported");
  assert.equal((await document()).status, 404);

  await storage.send(
    new PutObjectCommand({
      Bucket: "searchfiles",
      Key: key,
      Body: Buffer.alloc(0),
      ContentLength: 0,
      ContentType: "text/markdown",
    }),
  );
  assert.equal((await deliverUpload()).status, "unsupported");
  assert.equal((await document()).status, 404);
  console.log("Storage replacement removed the stale search row");
} finally {
  await storage.send(
    new DeleteObjectCommand({ Bucket: "searchfiles", Key: key }),
  );
  await document("DELETE");
}
