import assert from "node:assert/strict";
import test from "node:test";
import { parseTriggerDelivery } from "@neon/functions/triggers";

function delivery(type: "schedule" | "storage_object_created", header = true) {
  const data =
    type === "schedule"
      ? { scheduled_at: "2026-09-28T00:00:00Z" }
      : { bucket_name: "searchfiles", object_key: "documents/sample.md" };
  return new Request("http://localhost:8787/triggers/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(header ? { "X-Neon-Trigger-Invocation-Id": "local-test" } : {}),
    },
    body: JSON.stringify({
      version: 1,
      invocation_id: "local-test",
      trigger: { type, id: "trigger-local", name: "test" },
      data,
    }),
  });
}

test("Neon parses the object-created payload used by the ingest route", async () => {
  const parsed = await parseTriggerDelivery(delivery("storage_object_created"));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.invocation.type, "storage_object_created");
  if (parsed.invocation.type !== "storage_object_created") return;
  assert.equal(parsed.invocation.data.bucketName, "searchfiles");
  assert.equal(parsed.invocation.data.objectKey, "documents/sample.md");
});

test("Neon parses schedules and rejects a missing trigger header", async () => {
  const schedule = await parseTriggerDelivery(delivery("schedule"));
  assert.equal(schedule.ok, true);
  if (schedule.ok) assert.equal(schedule.invocation.type, "schedule");
  const missingHeader = await parseTriggerDelivery(delivery("schedule", false));
  assert.deepEqual(missingHeader, { ok: false, error: "missing_header" });
});
