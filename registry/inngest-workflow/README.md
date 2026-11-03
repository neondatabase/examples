# Durable workflow with Inngest

A minimal multi-step workflow running as a [Neon Function](https://neon.com/docs/compute/functions/overview). [Inngest](https://www.inngest.com) orchestrates the steps, so each `step.run` is checkpointed and retried on its own, and `step.sleep` waits without keeping the function running. Job state is stored in [Lakebase Postgres](https://neon.com/lakebase).

## How it works

1. `POST /api/events` sends an `app/job.created` event to Inngest.
2. Inngest calls `POST /api/inngest` to run the workflow:
   - `start-job` inserts the job with status `running`
   - `wait-before-finishing` sleeps durably for 5 seconds
   - `finish-job` marks the job `completed`
3. `GET /api/jobs/:id` shows the current row, so you can see the job change from `running` to `completed`.
4. A failed step is retried without re-running the steps that already succeeded.

| Route | Purpose |
| --- | --- |
| `POST /api/events` | Send an `app/job.created` event |
| `GET /api/jobs/:id` | Read a job's current state |
| `GET`, `PUT`, `POST` `/api/inngest` | Inngest's serve endpoint |
| `GET /` | Route index |

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new inngest-workflow --slug inngestworkflow
```

The CLI writes `functions/inngestworkflow/index.ts`, declares the function in `neon.ts`, and adds the Inngest keys to `.env.example`.

## Configure Inngest

For production, create a free account at [inngest.com](https://www.inngest.com), then copy the two keys into `.env.local`:

```bash
INNGEST_SIGNING_KEY="signkey-prod-..."
INNGEST_EVENT_KEY="..."
```

- `INNGEST_SIGNING_KEY` verifies the requests Inngest sends to `/api/inngest`.
- `INNGEST_EVENT_KEY` lets `POST /api/events` send events.

For local runs, any non-empty values work because the Inngest Dev Server ignores them. `neon dev` still validates the env declared in `neon.ts`, so add placeholders before starting:

```bash
INNGEST_SIGNING_KEY=dev
INNGEST_EVENT_KEY=dev
```

## Run locally

Local development uses the Inngest Dev Server, so the placeholder keys above are enough.

`neon dev` prints the URL it serves. The examples below use `http://localhost:8787`, which is the port it picks when free; if it prints a different one, use that instead.

```bash
# Terminal 1
INNGEST_DEV=1 neon dev

# Terminal 2
npx inngest-cli@latest dev -u http://localhost:8787/api/inngest
```

Send an event:

```bash
curl -X POST http://localhost:8787/api/events \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "app/job.created",
    "data": { "jobId": "job_1" }
  }'
```

The job starts in `running`. Check it immediately:

```bash
curl http://localhost:8787/api/jobs/job_1
```

After the 5-second sleep, the same request returns `completed`. The Inngest Dev Server UI is at [http://localhost:8288](http://localhost:8288), where the run and each step are visible.

## Deploy

```bash
neon deploy --env .env.local
neon functions get inngestworkflow
```

In Inngest Cloud, open **Apps → Sync new app** and enter:

```text
https://<function-url>/api/inngest
```

Then trigger the deployed workflow with the same `curl`, replacing the host with the function URL.

```bash
curl -X POST https://<function-url>/api/events \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "app/job.created",
    "data": { "jobId": "job_1" }
  }'
```

> Replace `<function-url>` with the URL from `neon functions get inngestworkflow`.

## Notes

- The `jobs` table is created on the first run with `CREATE TABLE IF NOT EXISTS`, so there is no migration step.
- `POST /api/events` is unauthenticated in this demo. Anyone with the function URL can start a workflow. Add authentication before exposing it.
- Add more `step.run` calls between the sleep to extend the workflow. Keep side effects inside `step.run` so a retry does not repeat completed work.
- `step.sleep("wait-before-finishing", "5s")` simulates a processing window. Inngest holds the timer; the function is not running or billed while it waits.
