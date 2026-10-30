import { createHash, timingSafeEqual } from "node:crypto";
import { parseTriggerDelivery } from "@neon/functions/triggers";
import type { Pool } from "pg";
import { HttpError, MAX_IMAGE_BYTES, OBJECT_KEY } from "./config.ts";
import { ImageError, inspectImage, verifyImage } from "./image.ts";
import { readBounded, ServiceError, type Services } from "./services.ts";
import { claim, finish, type Outcome } from "./store.ts";

// HTTP API:
//   GET  /health                        database and schema check (no key)
//   POST /object-created                the bucket trigger's delivery (no key; see below)
//   POST /v1/images                     upload a PNG or JPEG (raw body, Content-Type image/*)
//   GET  /v1/images/:sha256             the image's status, summary and categories
//   POST /v1/images/:sha256/reprocess   retry an image whose last attempt failed
//   GET  /v1/check                      Storage and AI Gateway access, without inference
// /v1 routes need `Authorization: Bearer <INSIGHTS_API_KEY>`.
//
// /object-created trusts the x-neon-trigger-invocation-id header: Neon's router
// strips x-neon-* headers from public requests and sets it only on trigger deliveries.

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const hash = (value: string) => createHash("sha256").update(value).digest();

function authorized(request: Request, apiKey: string): boolean {
  const token =
    request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  return token !== "" && timingSafeEqual(hash(token), hash(apiKey));
}

export interface Context {
  pool: Pool;
  services: Services;
  apiKey: string;
  bucket: string;
  model: string;
}

// Reads the uploaded image, asks the model for a summary and categories, and
// stores the result. Trigger retries are off by default, so a retryable failure
// is recorded and can be retried with /v1/images/:sha256/reprocess.
async function processImage(context: Context, key: string, invocationId: string) {
  const work = await claim(context.pool, key, invocationId, context.model);
  if (work.status !== "claimed") return work;
  let outcome: Outcome;
  try {
    const image = await context.services.read(key);
    const info = verifyImage(key, image.bytes, image.contentType);
    const insight = await context.services.summarize(image.bytes, info.contentType);
    outcome = { insight, sha256: info.sha256, bytes: info.bytes, contentType: info.contentType };
  } catch (error) {
    outcome =
      error instanceof ImageError
        ? { code: error.code, retryable: false, rejected: true }
        : error instanceof ServiceError
          ? { code: error.code, retryable: error.retryable, rejected: false }
          : { code: "upstream_unavailable", retryable: true, rejected: false };
  }
  const result = await finish(context.pool, key, work.token, outcome);
  console.info(JSON.stringify({ event: "image_processing", status: result.status }));
  return result;
}

export async function handle(request: Request, context: Context): Promise<Response> {
  const path = new URL(request.url).pathname;
  try {
    if (path === "/health") {
      if (request.method !== "GET") throw new HttpError(405, "method_not_allowed");
      const ready = await context.pool.query(
        "SELECT 1 FROM insights.schema_migrations WHERE name = '001_init.sql'",
      );
      if (!ready.rowCount) throw new HttpError(503, "schema_not_ready");
      return json({ status: "ok" });
    }

    if (path === "/object-created") {
      if (request.method !== "POST") throw new HttpError(405, "method_not_allowed");
      const parsed = await parseTriggerDelivery(request);
      if (!parsed.ok)
        throw new HttpError(parsed.error === "invalid_body" ? 400 : 401, parsed.error);
      const delivery = parsed.invocation;
      if (delivery.type !== "storage_object_created")
        throw new HttpError(400, "not_an_object_event");
      if (delivery.data.bucketName !== context.bucket)
        throw new HttpError(403, "unexpected_bucket");
      if (!OBJECT_KEY.test(delivery.data.objectKey))
        return json({ status: "ignored", reason: "content_addressed_image_required" });
      return json(await processImage(context, delivery.data.objectKey, delivery.invocationId));
    }

    if (!path.startsWith("/v1/")) throw new HttpError(404, "not_found");
    if (!context.apiKey) throw new HttpError(503, "api_key_not_configured");
    if (!authorized(request, context.apiKey)) throw new HttpError(401, "invalid_key");

    if (path === "/v1/check" && request.method === "GET") {
      await context.services.check();
      return json({ status: "ok", bucket: context.bucket, model: context.model });
    }

    if (path === "/v1/images" && request.method === "POST") {
      const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (contentType !== "image/png" && contentType !== "image/jpeg")
        throw new HttpError(415, "png_or_jpeg_required");
      if (!request.body) throw new HttpError(400, "empty_body");
      const bytes = await readBounded(request.body, MAX_IMAGE_BYTES);
      const info = inspectImage(bytes);
      if (info.contentType !== contentType) throw new HttpError(400, "content_type_mismatch");
      await context.services.put(info.key, bytes, info.contentType);
      return json({ key: info.key, sha256: info.sha256, status: "uploaded" }, 202);
    }

    const image = path.match(/^\/v1\/images\/([a-f0-9]{64})(\/reprocess)?$/);
    if (image) {
      const row = (
        await context.pool.query<{ object_key: string }>(
          `SELECT object_key, status, attempts, model, result, error_code, content_type,
            byte_length, updated_at FROM insights.images WHERE content_sha256 = $1
            OR object_key IN ($2, $3)`,
          [image[1], `uploads/${image[1]}.png`, `uploads/${image[1]}.jpg`],
        )
      ).rows[0];
      if (!row) throw new HttpError(404, "image_not_found");
      if (!image[2] && request.method === "GET") return json(row);
      if (image[2] && request.method === "POST")
        return json(await processImage(context, row.object_key, `reprocess-${Date.now()}`));
    }

    throw new HttpError(404, "not_found");
  } catch (error) {
    if (error instanceof HttpError) return json({ error: { code: error.code } }, error.status);
    if (error instanceof ImageError) return json({ error: { code: error.code } }, 400);
    if (error instanceof ServiceError) return json({ error: { code: error.code } }, 502);
    if (error instanceof Error && "code" in error && error.code === "42P01")
      return json({ error: { code: "schema_not_ready" } }, 503);
    console.error("Image insights request failed", error);
    return json({ error: { code: "temporarily_unavailable" } }, 503);
  }
}
