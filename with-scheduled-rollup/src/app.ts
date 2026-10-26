import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { parseTriggerDelivery } from "@neon/functions/triggers";
import type pg from "pg";
import { HttpError, rollup } from "./rollup.ts";

// HTTP API:
//   GET  /health                 database and schema check (no key)
//   POST /schedule               the schedule trigger's delivery (no key; see below)
//   POST /v1/events              { occurred_at? }  record one event
//   GET  /v1/daily-totals?days=7 recent daily counts
//   POST /v1/rollup              recompute the totals now
// /v1 routes need `Authorization: Bearer <ROLLUP_API_KEY>`.
//
// /schedule trusts the x-neon-trigger-invocation-id header: Neon's router strips
// x-neon-* headers from public requests and sets it only on trigger deliveries.

const json = (data: unknown, status = 200): Response =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

const hash = (value: string) => createHash("sha256").update(value).digest();

function authorized(request: Request, apiKey: string): boolean {
  const token =
    request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  return token !== "" && timingSafeEqual(hash(token), hash(apiKey));
}

async function inTransaction<T>(
  pool: pg.Pool,
  run: (db: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SET LOCAL statement_timeout = '10s'");
    await db.query("SET LOCAL lock_timeout = '2s'");
    const result = await run(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

export async function handle(
  request: Request,
  { pool, apiKey }: { pool: pg.Pool; apiKey: string },
): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (url.pathname === "/health") {
      if (request.method !== "GET") throw new HttpError(405, "method_not_allowed");
      const ready = await pool.query(
        "SELECT 1 FROM rollup.schema_migrations WHERE name = '001_init.sql'",
      );
      if (!ready.rowCount) throw new HttpError(503, "schema_not_ready");
      return json({ status: "ok" });
    }

    if (url.pathname === "/schedule") {
      if (request.method !== "POST") throw new HttpError(405, "method_not_allowed");
      const parsed = await parseTriggerDelivery(request);
      if (!parsed.ok)
        throw new HttpError(parsed.error === "invalid_body" ? 400 : 401, parsed.error);
      const delivery = parsed.invocation;
      if (delivery.type !== "schedule") throw new HttpError(400, "not_a_schedule");
      // Trigger retries are off by default, so a failed run isn't redelivered. The
      // next run recomputes the same days, which catches up.
      const result = await inTransaction(pool, (db) =>
        rollup(db, {
          invocationId: delivery.invocationId,
          triggerId: delivery.trigger.id,
          scheduledAt: delivery.data.scheduledAt,
        }),
      );
      return json(result);
    }

    if (!url.pathname.startsWith("/v1/")) throw new HttpError(404, "not_found");
    if (!apiKey) throw new HttpError(503, "api_key_not_configured");
    if (!authorized(request, apiKey)) throw new HttpError(401, "invalid_key");

    if (url.pathname === "/v1/events" && request.method === "POST") {
      const body: unknown = await request.json().catch(() => undefined);
      const occurredAt =
        body && typeof body === "object" && "occurred_at" in body
          ? body.occurred_at
          : undefined;
      if (occurredAt !== undefined && (typeof occurredAt !== "string" || Number.isNaN(Date.parse(occurredAt))))
        throw new HttpError(400, "invalid_occurred_at");
      const inserted = await pool.query<{ id: string; occurred_at: Date }>(
        "INSERT INTO rollup.events (occurred_at) VALUES (coalesce($1::timestamptz, now())) RETURNING id, occurred_at",
        [occurredAt ?? null],
      );
      return json(inserted.rows[0], 201);
    }

    if (url.pathname === "/v1/daily-totals" && request.method === "GET") {
      const days = Number(url.searchParams.get("days") ?? 7);
      if (!Number.isInteger(days) || days < 1 || days > 90)
        throw new HttpError(400, "invalid_days");
      const totals = await pool.query<{ day: string; event_count: string }>(
        `SELECT day::text, event_count::text FROM rollup.daily_totals
        WHERE day > (now() AT TIME ZONE 'UTC')::date - $1::integer ORDER BY day DESC`,
        [days],
      );
      return json({
        totals: totals.rows.map((row) => ({ day: row.day, event_count: Number(row.event_count) })),
      });
    }

    if (url.pathname === "/v1/rollup" && request.method === "POST") {
      const result = await inTransaction(pool, (db) =>
        rollup(db, {
          invocationId: `manual-${randomUUID()}`,
          triggerId: "manual",
          scheduledAt: new Date().toISOString(),
        }),
      );
      return json(result);
    }

    throw new HttpError(404, "not_found");
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: { code: error.code } }, error.status);
    if (error instanceof Error && "code" in error && error.code === "42P01")
      return json({ error: { code: "schema_not_ready" } }, 503);
    console.error("Rollup request failed", error);
    return json({ error: { code: "temporarily_unavailable" } }, 503);
  }
}
