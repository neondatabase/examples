CREATE TABLE rollup.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_occurred_at_idx ON rollup.events (occurred_at);

CREATE TABLE rollup.daily_totals (
  day date PRIMARY KEY,
  event_count bigint NOT NULL CHECK (event_count >= 0),
  updated_at timestamptz NOT NULL
);

CREATE TABLE rollup.runs (
  invocation_id text PRIMARY KEY,
  trigger_id text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  window_start date NOT NULL,
  window_end date NOT NULL,
  event_count bigint NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (trigger_id, scheduled_at)
);
