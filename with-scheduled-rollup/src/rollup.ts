import type { PoolClient } from "pg";

/** How many UTC days each run recomputes, so a missed or late run catches up. */
export const LOOKBACK_DAYS = 2;

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export interface Occurrence {
  invocationId: string;
  triggerId: string;
  scheduledAt: string;
}

// Recomputes the last LOOKBACK_DAYS of daily totals from rollup.events and
// records the run. Totals are absolute counts, so a repeated or late delivery
// can't count an event twice. Run it inside a transaction.
export async function rollup(db: PoolClient, occurrence: Occurrence) {
  const prior = await db.query<{
    invocation_id: string;
    trigger_id: string;
    scheduled_at: Date;
  }>(
    `SELECT invocation_id, trigger_id, scheduled_at FROM rollup.runs
    WHERE invocation_id = $1 OR (trigger_id = $2 AND scheduled_at = $3)`,
    [occurrence.invocationId, occurrence.triggerId, occurrence.scheduledAt],
  );
  if (
    prior.rows.some(
      (run) =>
        run.invocation_id === occurrence.invocationId &&
        (run.trigger_id !== occurrence.triggerId ||
          run.scheduled_at.getTime() !== Date.parse(occurrence.scheduledAt)),
    )
  )
    throw new HttpError(409, "invocation_conflict");
  if (prior.rowCount) return { status: "duplicate" };

  const result = await db.query<{
    window_start: string;
    window_end: string;
    event_count: string;
  }>(
    `WITH bounds AS (
      SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date AS today
    ), days AS (
      SELECT today - n AS day FROM bounds, generate_series(0, $1::integer - 1) AS n
    ), counts AS (
      SELECT (occurred_at AT TIME ZONE 'UTC')::date AS day, count(*) AS event_count
      FROM rollup.events, bounds
      WHERE occurred_at >= ((today - ($1::integer - 1))::timestamp AT TIME ZONE 'UTC')
        AND occurred_at < ((today + 1)::timestamp AT TIME ZONE 'UTC')
      GROUP BY 1
    ), updated AS (
      INSERT INTO rollup.daily_totals (day, event_count, updated_at)
      SELECT days.day, coalesce(counts.event_count, 0), clock_timestamp()
      FROM days LEFT JOIN counts USING (day)
      ON CONFLICT (day) DO UPDATE SET event_count = EXCLUDED.event_count, updated_at = EXCLUDED.updated_at
      RETURNING day, event_count
    )
    INSERT INTO rollup.runs
      (invocation_id, trigger_id, scheduled_at, window_start, window_end, event_count)
    SELECT $2, $3, $4, min(day), max(day), sum(event_count) FROM updated
    RETURNING window_start::text, window_end::text, event_count::text`,
    [LOOKBACK_DAYS, occurrence.invocationId, occurrence.triggerId, occurrence.scheduledAt],
  );
  return { status: "completed", ...result.rows[0] };
}
