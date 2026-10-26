import { createHash, timingSafeEqual } from "node:crypto";
import type pg from "pg";
import {
  acknowledge,
  claim,
  config,
  enqueue,
  HttpError,
  type JsonValue,
  retry,
} from "./queue.ts";

// HTTP API:
//   GET  /health                   database and schema check (no key)
//   POST /v1/jobs                  { queue, payload } + Idempotency-Key header
//   POST /v1/jobs/claim            { queue, batch_size }
//   POST /v1/jobs/:id/ack          { lease_token }
//   POST /v1/jobs/:id/retry        { lease_token, delay_seconds }
// Every /v1 route needs `Authorization: Bearer <QUEUE_API_KEY>`.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUEUE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;

const json = (data: unknown, status = 200): Response =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

const hash = (value: string) => createHash("sha256").update(value).digest();

// Compare digests so the check takes the same time whatever the key's length.
function authorized(request: Request, apiKey: string): boolean {
  const token =
    request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  return token !== "" && timingSafeEqual(hash(token), hash(apiKey));
}

function fields(
  body: JsonValue,
  allowed: string[],
): asserts body is { [key: string]: JsonValue } {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key)) ||
    allowed.some((key) => !Object.hasOwn(body, key))
  )
    throw new HttpError(400, "invalid_body");
}

async function readJson(request: Request): Promise<JsonValue> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new HttpError(415, "json_required");
  const text = await request.text();
  if (Buffer.byteLength(text) > config.maxPayloadBytes + 4096)
    throw new HttpError(413, "body_too_large");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

export async function handle(
  request: Request,
  { pool, apiKey }: { pool: pg.Pool; apiKey: string },
): Promise<Response> {
  const path = new URL(request.url).pathname;
  let db: pg.PoolClient | undefined;
  try {
    if (path === "/health") {
      if (request.method !== "GET") throw new HttpError(405, "method_not_allowed");
      const ready = await pool.query(
        "SELECT 1 FROM queue.schema_migrations WHERE name = '001_init.sql'",
      );
      if (!ready.rowCount) throw new HttpError(503, "schema_not_ready");
      return json({ status: "ok" });
    }

    const action = path.match(/^\/v1\/jobs\/([^/]+)\/(ack|retry)$/);
    if (path !== "/v1/jobs" && path !== "/v1/jobs/claim" && !action)
      throw new HttpError(404, "not_found");
    if (request.method !== "POST") throw new HttpError(405, "method_not_allowed");
    if (!apiKey) throw new HttpError(503, "api_key_not_configured");
    if (!authorized(request, apiKey)) throw new HttpError(401, "invalid_key");
    if (action && !UUID.test(action[1])) throw new HttpError(400, "invalid_job_id");
    const body = await readJson(request);

    db = await pool.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL statement_timeout = '5s'");
    await db.query("SET LOCAL lock_timeout = '2s'");
    let result: unknown;
    let status = 200;
    if (path === "/v1/jobs") {
      fields(body, ["queue", "payload"]);
      if (typeof body.queue !== "string" || !QUEUE.test(body.queue))
        throw new HttpError(400, "invalid_queue");
      if (Buffer.byteLength(JSON.stringify(body.payload)) > config.maxPayloadBytes)
        throw new HttpError(413, "payload_too_large");
      const idempotencyKey = request.headers.get("idempotency-key");
      if (!idempotencyKey || !/^[\x21-\x7e]{1,200}$/.test(idempotencyKey))
        throw new HttpError(400, "idempotency_key_required");
      const job = await enqueue(db, {
        queue: body.queue,
        payload: body.payload,
        idempotencyKey,
      });
      result = job;
      status = job.duplicate ? 200 : 201;
    } else if (path === "/v1/jobs/claim") {
      fields(body, ["queue", "batch_size"]);
      if (
        typeof body.queue !== "string" ||
        !QUEUE.test(body.queue) ||
        typeof body.batch_size !== "number" ||
        !Number.isInteger(body.batch_size) ||
        body.batch_size < 1 ||
        body.batch_size > 50
      )
        throw new HttpError(400, "invalid_claim");
      result = { jobs: await claim(db, { queue: body.queue, batchSize: body.batch_size }) };
    } else if (action) {
      const [, jobId, verb] = action;
      fields(body, verb === "ack" ? ["lease_token"] : ["lease_token", "delay_seconds"]);
      if (typeof body.lease_token !== "string" || !UUID.test(body.lease_token))
        throw new HttpError(400, "invalid_lease_token");
      if (verb === "ack") {
        result = await acknowledge(db, jobId, body.lease_token);
      } else {
        if (
          typeof body.delay_seconds !== "number" ||
          !Number.isInteger(body.delay_seconds) ||
          body.delay_seconds < 0 ||
          body.delay_seconds > 86_400
        )
          throw new HttpError(400, "invalid_retry_delay");
        result = await retry(db, jobId, body.lease_token, body.delay_seconds);
      }
    }
    await db.query("COMMIT");
    return json(result, status);
  } catch (error) {
    if (db) await db.query("ROLLBACK").catch(() => {});
    if (error instanceof HttpError)
      return json({ error: { code: error.code } }, error.status);
    // The schema isn't there yet (first deploy, before the migration hook ran).
    if (error instanceof Error && "code" in error && error.code === "42P01")
      return json({ error: { code: "schema_not_ready" } }, 503);
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "22P02" || error.code === "22P05")
    )
      return json({ error: { code: "unsupported_json_value" } }, 400);
    console.error("Queue request failed", error);
    return json({ error: { code: "temporarily_unavailable" } }, 503);
  } finally {
    db?.release();
  }
}
