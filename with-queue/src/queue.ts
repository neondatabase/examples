import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

// Durable jobs in queue.jobs: enqueue with an idempotency key, claim a batch
// under a lease, then acknowledge or retry with the lease token. Delivery is at
// least once, so make your job handlers idempotent.

export const config = {
  /** How long a claimed job stays leased before another worker can claim it. */
  visibilityTimeoutSeconds: 60,
  /** Deliveries before a job is dead-lettered. */
  maxAttempts: 5,
  /** Largest payload accepted, in bytes of JSON. */
  maxPayloadBytes: 65_536,
};

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JobStatus = "ready" | "leased" | "done" | "dead";

export interface Job {
  id: string;
  status: JobStatus;
}

export interface LeasedJob {
  id: string;
  queue: string;
  payload: JsonValue;
  attempts: number;
  lease_token: string;
  lease_until: Date;
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

// Key order doesn't change what a request means.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export async function enqueue(
  db: PoolClient,
  input: { queue: string; payload: JsonValue; idempotencyKey: string },
): Promise<Job & { duplicate: boolean }> {
  const requestHash = digest(canonical({ queue: input.queue, payload: input.payload }));
  const inserted = await db.query<Job>(
    `INSERT INTO queue.jobs (id, queue_name, idempotency_key, request_hash, payload)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    ON CONFLICT (queue_name, idempotency_key) DO NOTHING RETURNING id, status`,
    [randomUUID(), input.queue, input.idempotencyKey, requestHash, JSON.stringify(input.payload)],
  );
  if (inserted.rowCount) return { ...inserted.rows[0], duplicate: false };
  // A separate READ COMMITTED statement sees the concurrent winner after ON CONFLICT waits.
  const existing = await db.query<Job & { request_hash: string }>(
    `SELECT id, status, request_hash FROM queue.jobs
    WHERE queue_name = $1 AND idempotency_key = $2`,
    [input.queue, input.idempotencyKey],
  );
  if (!existing.rowCount || existing.rows[0].request_hash !== requestHash)
    throw new HttpError(409, "idempotency_conflict");
  return { id: existing.rows[0].id, status: existing.rows[0].status, duplicate: true };
}

export async function claim(
  db: PoolClient,
  input: { queue: string; batchSize: number },
): Promise<LeasedJob[]> {
  // Expired leases go back to ready (or dead) as part of claiming, so the queue
  // needs no schedule.
  await db.query(
    `WITH expired AS (
      SELECT id FROM queue.jobs
      WHERE queue_name = $1 AND status = 'leased' AND lease_until <= clock_timestamp()
      ORDER BY lease_until, id FOR UPDATE SKIP LOCKED LIMIT 100
    ) UPDATE queue.jobs j SET
      status = CASE WHEN j.attempts >= $2 THEN 'dead' ELSE 'ready' END,
      lease_token = NULL, lease_until = NULL, available_at = clock_timestamp()
    FROM expired WHERE j.id = expired.id`,
    [input.queue, config.maxAttempts],
  );
  const result = await db.query<LeasedJob>(
    `WITH candidates AS (
      SELECT id FROM queue.jobs
      WHERE queue_name = $1 AND status = 'ready' AND available_at <= clock_timestamp()
      ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT $2
    ) UPDATE queue.jobs j SET status = 'leased', attempts = j.attempts + 1,
      lease_token = gen_random_uuid(),
      lease_until = clock_timestamp() + ($3 * interval '1 second'),
      last_retry_token = NULL, last_retry_delay = NULL
    FROM candidates WHERE j.id = candidates.id
    RETURNING j.id, j.queue_name AS queue, j.payload, j.attempts, j.lease_token, j.lease_until`,
    [input.queue, input.batchSize, config.visibilityTimeoutSeconds],
  );
  return result.rows;
}

export async function acknowledge(
  db: PoolClient,
  jobId: string,
  leaseToken: string,
): Promise<Job> {
  const result = await db.query<Job>(
    `UPDATE queue.jobs SET status = 'done',
      completed_lease_token = lease_token, lease_token = NULL, lease_until = NULL
    WHERE id = $1 AND status = 'leased' AND lease_token = $2 AND lease_until > clock_timestamp()
    RETURNING id, status`,
    [jobId, leaseToken],
  );
  if (result.rowCount) return result.rows[0];
  // Acknowledging the same delivery twice is fine.
  const done = await db.query<Job>(
    `SELECT id, status FROM queue.jobs
    WHERE id = $1 AND status = 'done' AND completed_lease_token = $2`,
    [jobId, leaseToken],
  );
  if (done.rowCount) return done.rows[0];
  throw new HttpError(409, "lease_conflict");
}

export async function retry(
  db: PoolClient,
  jobId: string,
  leaseToken: string,
  delaySeconds: number,
): Promise<Job & { available_at: Date }> {
  const result = await db.query<Job & { available_at: Date }>(
    `UPDATE queue.jobs SET
      status = CASE WHEN attempts >= $4 THEN 'dead' ELSE 'ready' END,
      available_at = clock_timestamp() + ($3 * interval '1 second'),
      last_retry_token = lease_token, last_retry_delay = $3, lease_token = NULL, lease_until = NULL
    WHERE id = $1 AND status = 'leased' AND lease_token = $2 AND lease_until > clock_timestamp()
    RETURNING id, status, available_at`,
    [jobId, leaseToken, delaySeconds, config.maxAttempts],
  );
  if (result.rowCount) return result.rows[0];
  // Retrying the same delivery twice with the same delay is fine.
  const previous = await db.query<Job & { available_at: Date }>(
    `SELECT id, status, available_at FROM queue.jobs
    WHERE id = $1 AND status IN ('ready', 'dead') AND last_retry_token = $2 AND last_retry_delay = $3`,
    [jobId, leaseToken, delaySeconds],
  );
  if (previous.rowCount) return previous.rows[0];
  throw new HttpError(409, "lease_conflict");
}
