## Neon

By default, when using the Neon CLI, always use the project `[PROJECT NAME]` (id: `[PROJECT ID]`).

## This project

A job queue on Neon Functions and Postgres. The sections below cover calling it and changing it.

- `src/` is the function: `app.ts` routes and validates requests, `queue.ts` holds the SQL.
- `migrations/` holds the schema. Add new files; never edit applied ones.
- `neon.ts` declares the function and runs migrations plus a smoke test after every `neon deploy`.
- Deploy with `npm run deploy` (`neon deploy --env .env.local`). `QUEUE_API_KEY` lives in `.env.local`.

## Neon job queue

This project is a job queue running as a Neon Function (`queue`) on a Postgres table (`queue.jobs`). Your backend calls its HTTP API with `Authorization: Bearer $QUEUE_API_KEY`. The key is in `.env.local`; never commit it or send it to a browser.

Find the URL with `neon functions get queue`.

### Enqueue

```
POST /v1/jobs
Idempotency-Key: <unique per job, for example an order ID>
{ "queue": "emails", "payload": { ... } }
```

201 creates the job. 200 with `"duplicate": true` means that key was already used for the same request, so retrying a timed-out enqueue is safe. 409 `idempotency_conflict` means the key was used with a different payload.

### Work

1. `POST /v1/jobs/claim` with `{ "queue": "emails", "batch_size": 10 }` returns jobs, each with a `lease_token` and `lease_until` (60 seconds by default).
2. Do the work. Delivery is at least once, so make it idempotent.
3. `POST /v1/jobs/<id>/ack` with `{ "lease_token": "..." }` when it succeeds.
4. `POST /v1/jobs/<id>/retry` with `{ "lease_token": "...", "delay_seconds": 30 }` when it fails. After 5 deliveries a job becomes `dead`.

If a worker dies, its lease expires and the next claim picks the job up again.

### Change the schema

Add a new file in `migrations/`, such as `002_add_priority.sql`. Don't edit an applied migration: the migrator refuses a file whose checksum changed. `neon deploy --env .env.local` applies new migrations after deploying, then checks the function answers. Limits such as the lease length live in `src/queue.ts` (`config`).
