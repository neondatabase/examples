# Rate limit with Postgres

A Neon Function that enforces a fixed-window rate limit with one atomic Postgres upsert. Counters are stored in Postgres, so every function instance reads and writes the same state.

The default is 10 requests per key per 60-second window. Both values are constants at the top of the module.

## Scaffold it

```bash
npm install -g neon@latest
neon login
neon link
neon functions new rate-limit-postgres
```

The CLI writes `functions/ratelimitpostgres/index.ts` and declares the function in `neon.ts`. Postgres is enabled by default, so `DATABASE_URL` is already available.

## Run locally

```bash
neon dev
```

Check a key 12 times:

```bash
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:8787/check \
    -H 'content-type: application/json' \
    -d '{"key":"user-1"}'
done
```

The first 10 return `200`, the last 2 return `429`. If you run the loop again, use a fresh key or
wait for the next 60-second window; a key that is already at the limit stays at `429` until the
window resets. The response includes the counters:

```json
{
  "key": "user-1",
  "allowed": false,
  "limit": 10,
  "remaining": 0,
  "resetAt": "2026-11-01T04:02:00.000Z"
}
```

Every `200` or `429` `/check` response sets `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and
`X-RateLimit-Reset`; a `429` also sets `Retry-After`.

Read the current window without incrementing it:

```bash
curl -s 'http://localhost:8787/usage?key=user-1'
```

## Deploy

```bash
neon deploy
neon functions get ratelimitpostgres
```

No extra configuration is needed: the template uses the branch's `DATABASE_URL`.

## Routes

| Route | Purpose |
| --- | --- |
| `POST /check` | `{ key }` counts one request and returns `200` or `429`. |
| `GET /usage?key=...` | Reads the current window without counting. |

## How it works

The function creates `rate_limit_counters (key, window_start, count)` on first use. Each check runs one statement:

```sql
INSERT INTO rate_limit_counters (key, window_start, count)
VALUES ($1, $2, 1)
ON CONFLICT (key) DO UPDATE SET
  count = CASE
    WHEN rate_limit_counters.window_start = EXCLUDED.window_start
    THEN rate_limit_counters.count + 1
    ELSE 1
  END,
  window_start = EXCLUDED.window_start
RETURNING count, window_start;
```

The conflict update is atomic, so concurrent requests in different function instances cannot both read the same count and overwrite each other.

## Notes

- `key` is whatever the caller sends. In a real app, derive it from the authenticated user, API key, or client IP rather than trusting the body.
- Change `LIMIT` and `WINDOW_SECONDS` to tune the policy. The window is fixed, not sliding: a burst at the end of one window and the start of the next can reach twice the limit.
- Old keys stay in the table, one row per distinct key. Delete stale rows in a scheduled job; add an
  index on `window_start` if that cleanup scans too much.
