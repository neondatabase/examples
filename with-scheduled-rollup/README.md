# Scheduled rollup

Daily event totals on Neon Functions and Postgres. Your backend records events over HTTP, and a Neon schedule trigger recomputes the last two UTC days of totals on a cron.

## What gets deployed

- A Neon Function, `rollup`, serving the API and receiving the trigger.
- A schedule trigger, `daily-rollup`, that POSTs to `/schedule` (daily at 00:05 UTC by default).
- A `rollup` schema with `events`, `daily_totals` and `runs`, created by `migrations/`.

`neon deploy --env .env.local` deploys the function and trigger, then the `deploy.after` hook in `neon.ts` applies any new migrations and checks the function answers.

## Deploy it

One command scaffolds it, creates a new Neon project, generates its key into `.env.local`, and deploys it:

```sh
neon bootstrap my-rollup --template scheduled-rollup --deploy
```

`--deploy` is staging-only for now. To deploy it by hand:

```sh
npm install
neon link --project-name my-rollup
echo "ROLLUP_API_KEY=$(openssl rand -hex 32)" > .env.local
npm run deploy
```

## API

| Request | Body | Result |
| --- | --- | --- |
| `GET /health` | | 200 when the database and schema are ready |
| `POST /v1/events` | `{}` or `{ "occurred_at" }` | 201 with the event |
| `GET /v1/daily-totals?days=7` | | `{ "totals": [...] }` |
| `POST /v1/rollup` | | Recompute now |
| `POST /schedule` | Trigger delivery | Only Neon's trigger can call it |

`/v1` requests need `Authorization: Bearer $ROLLUP_API_KEY`.
