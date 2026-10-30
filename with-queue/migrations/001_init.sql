CREATE TABLE queue.jobs (
  id uuid PRIMARY KEY,
  queue_name text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'leased', 'done', 'dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  completed_lease_token uuid,
  last_retry_token uuid,
  last_retry_delay integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (queue_name, idempotency_key),
  CHECK (
    (status = 'leased' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (status <> 'leased' AND lease_token IS NULL AND lease_until IS NULL)
  )
);
CREATE INDEX jobs_ready_idx
  ON queue.jobs (queue_name, available_at, id)
  WHERE status = 'ready';
CREATE INDEX jobs_expired_idx
  ON queue.jobs (queue_name, lease_until, id)
  WHERE status = 'leased';
