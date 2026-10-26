CREATE TABLE insights.images (
  object_key text PRIMARY KEY,
  invocation_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing','retryable','completed','rejected','failed')),
  attempts integer NOT NULL CHECK (attempts >= 0),
  model text NOT NULL,
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz,
  content_sha256 text,
  content_type text,
  byte_length integer,
  result jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
