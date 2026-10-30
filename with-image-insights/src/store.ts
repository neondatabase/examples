import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { LEASE_SECONDS, MAX_ATTEMPTS, RETRY_SECONDS } from "./config.ts";
import type { Insight } from "./services.ts";

// One row per uploaded image in insights.images. A processing attempt takes a
// lease on the row, so two deliveries for the same image never run the model
// twice at once, and a finished image is never processed again.

export async function transaction<T>(
  pool: Pool,
  work: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SET LOCAL statement_timeout = '5s'");
    await db.query("SET LOCAL lock_timeout = '2s'");
    const result = await work(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

export type Claim =
  | { status: "claimed"; token: string }
  | { status: "duplicate" | "failed" | "pending" };

export async function claim(
  pool: Pool,
  key: string,
  invocationId: string,
  model: string,
): Promise<Claim> {
  return transaction(pool, async (db) => {
    const prior = (
      await db.query<{ status: string; attempts: number; busy: boolean; waiting: boolean }>(
        `SELECT status, attempts, lease_until > clock_timestamp() AS busy,
        next_attempt_at > clock_timestamp() AS waiting
        FROM insights.images WHERE object_key = $1 FOR UPDATE`,
        [key],
      )
    ).rows[0];
    if (prior && ["completed", "rejected", "failed"].includes(prior.status))
      return { status: "duplicate" };
    if (prior?.busy || prior?.waiting) return { status: "pending" };
    if (prior && prior.attempts >= MAX_ATTEMPTS) {
      await db.query(
        `UPDATE insights.images SET status = 'failed', error_code = 'attempt_limit',
        lease_token = NULL, lease_until = NULL, updated_at = clock_timestamp()
        WHERE object_key = $1`,
        [key],
      );
      return { status: "failed" };
    }
    const token = randomUUID();
    await db.query(
      `INSERT INTO insights.images
        (object_key, invocation_id, status, attempts, lease_token, lease_until, model)
      VALUES ($1, $2, 'processing', 1, $3, clock_timestamp() + make_interval(secs => $4), $5)
      ON CONFLICT (object_key) DO UPDATE SET status = 'processing',
        attempts = insights.images.attempts + 1, invocation_id = EXCLUDED.invocation_id,
        lease_token = EXCLUDED.lease_token, lease_until = EXCLUDED.lease_until,
        next_attempt_at = NULL, error_code = NULL, updated_at = clock_timestamp()`,
      [key, invocationId, token, LEASE_SECONDS, model],
    );
    return { status: "claimed", token };
  });
}

export type Outcome =
  | { insight: Insight; sha256: string; bytes: number; contentType: string }
  | { code: string; retryable: boolean; rejected: boolean };

export async function finish(
  pool: Pool,
  key: string,
  token: string,
  outcome: Outcome,
): Promise<{ status: string }> {
  return transaction(pool, async (db) => {
    const success = "insight" in outcome;
    const result = await db.query<{ status: string }>(
      `UPDATE insights.images SET
        status = CASE WHEN $3 THEN 'completed' WHEN $4 THEN 'rejected'
          WHEN $5 AND attempts < $6 THEN 'retryable' ELSE 'failed' END,
        result = $7, content_sha256 = $8, byte_length = $9, content_type = $10, error_code = $11,
        next_attempt_at = CASE WHEN NOT $3 AND $5 AND attempts < $6
          THEN clock_timestamp() + make_interval(secs => $12) END,
        lease_token = NULL, lease_until = NULL, updated_at = clock_timestamp()
      WHERE object_key = $1 AND lease_token = $2 AND status = 'processing'
        AND lease_until > clock_timestamp()
      RETURNING status`,
      [
        key,
        token,
        success,
        success ? false : outcome.rejected,
        success ? false : outcome.retryable,
        MAX_ATTEMPTS,
        success ? outcome.insight : null,
        success ? outcome.sha256 : null,
        success ? outcome.bytes : null,
        success ? outcome.contentType : null,
        success ? null : outcome.code,
        RETRY_SECONDS,
      ],
    );
    return result.rows[0] ?? { status: "lease_lost" };
  });
}
