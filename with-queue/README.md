# Job queue

A durable job queue on Neon Functions and Postgres. Your backend enqueues jobs over HTTP, and workers claim, acknowledge and retry them. Delivery is at least once, with idempotent enqueue, leases, bounded retries and dead-lettering.

## What gets deployed

- A Neon Function, `queue`, serving the HTTP API.
- A `queue` schema in your database with a `jobs` table, created by `migrations/`.

`neon deploy --env .env.local` deploys the function, then its `deploy.after` hook in `neon.ts` applies any new migrations and checks the function answers.

## Deploy it

One command scaffolds it, creates a new Neon project, generates its key into `.env.local`, and deploys it:

```sh
neon bootstrap my-queue --template queue --deploy
```

`--deploy` is staging-only for now. To deploy it by hand:

```sh
npm install
neon link --project-name my-queue          # create a new Neon project for it
echo "QUEUE_API_KEY=$(openssl rand -base64 32 | tr -d '/+=')" > .env.local
npm run deploy
neon functions get queue                     # shows the URL
```

## API

| Request | Body | Result |
| --- | --- | --- |
| `GET /health` | | 200 when the database and schema are ready |
| `POST /v1/jobs` + `Idempotency-Key` header | `{ "queue", "payload" }` | 201 created, or 200 `duplicate: true` |
| `POST /v1/jobs/claim` | `{ "queue", "batch_size" }` (1–50) | `{ "jobs": [...] }` with lease tokens |
| `POST /v1/jobs/:id/ack` | `{ "lease_token" }` | `done` |
| `POST /v1/jobs/:id/retry` | `{ "lease_token", "delay_seconds" }` | `ready` again, or `dead` after 5 deliveries |

Every `/v1` request needs `Authorization: Bearer $QUEUE_API_KEY`. Errors are `{ "error": { "code" } }`.
