# Durable workflow with Inngest

This template runs a minimal multi-step workflow as a [Neon Function](https://neon.com/docs/compute/functions/overview). [Inngest](https://www.inngest.com) orchestrates the steps. It checkpoints and retries each `step.run` on its own, and `step.sleep` waits without keeping the function running. The function stores job state in [Lakebase Postgres](https://neon.com/lakebase).

## How it works

1. `POST /api/events` sends an `app/job.created` event to Inngest.
2. Inngest calls `POST /api/inngest` to run the workflow:
   - `start-job` inserts the job with status `running`
   - `wait-before-finishing` sleeps durably for 5 seconds
   - `finish-job` marks the job `completed`
3. `GET /api/jobs/:id` shows the current row, so you can see the job change from `running` to `completed`.
4. Inngest retries a failed step without re-running the steps that already succeeded.

<Operations>

| Route | Purpose |
| --- | --- |
| `POST /api/events` | Send an `app/job.created` event |
| `GET /api/jobs/:id` | Read a job's current state |
| `GET`, `PUT`, `POST` `/api/inngest` | Inngest's serve endpoint |
| `GET /` | Route index |

</Operations>

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

<EnvironmentVariables>

- `INNGEST_SIGNING_KEY` verifies the requests Inngest sends to `/api/inngest`.
- `INNGEST_EVENT_KEY` lets `POST /api/events` send events.

</EnvironmentVariables>

For local runs, any non-empty values work because the Inngest Dev Server ignores them. `neon dev` still validates the env declared in `neon.ts`, so add placeholders before you start it:

```bash
INNGEST_SIGNING_KEY=dev
INNGEST_EVENT_KEY=dev
```

## Run locally

Local development uses the Inngest Dev Server, so the placeholder keys above are enough.

`neon dev` prints the URL it serves. The examples below use `http://localhost:8787`, the port it picks when that port is free. If it prints a different URL, use that one instead.

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

The job starts in `running`, which you can check right away:

```bash
curl http://localhost:8787/api/jobs/job_1
```

After the 5-second sleep, the same request returns `completed`. The Inngest Dev Server UI at [http://localhost:8288](http://localhost:8288) shows the run and each of its steps.

## Deploy

```bash
neon deploy --env .env.local
neon functions get inngestworkflow
```

In Inngest Cloud, open **Apps**, choose **Sync new app**, and enter this URL:

```text
https://<function-url>/api/inngest
```

Then trigger the deployed workflow with the same `curl` and the function URL as the host.

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

- The function creates the `jobs` table on its first run with `CREATE TABLE IF NOT EXISTS`, so there is no migration step.
- `POST /api/events` has no authentication in this demo, so anyone with the function URL can start a workflow. Add authentication before you expose it.
- Add more `step.run` calls around the sleep to extend the workflow. Keep side effects inside `step.run` so a retry doesn't repeat completed work.
- `step.sleep("wait-before-finishing", "5s")` simulates a processing window. Inngest holds the timer, so the function isn't running or billed while it waits.
