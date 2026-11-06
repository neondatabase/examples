# Durable workflow with Upstash Workflow

This template runs a minimal multi-step job as a [Neon Function](https://neon.com/docs/compute/functions/overview). [Upstash Workflow](https://upstash.com/docs/workflow/getstarted) checkpoints each `context.run`, retries only the steps that fail, and hands `context.sleep` timers to QStash, so the function stops running while it waits. The function stores job state in [Lakebase Postgres](https://neon.com/lakebase).

## How it works

1. `POST /api/jobs` starts a workflow run through QStash.
2. QStash calls `POST /api/workflow` once per step:
   - `start-job` inserts the job with status `running`
   - `wait-before-finishing` sleeps durably for 5 seconds
   - `finish-job` marks the job `completed`
3. `GET /api/jobs/:id` shows the current row, so you can see the job change from `running` to `completed`.
4. Upstash Workflow retries a failed step without re-running the steps that already succeeded.

<Operations>

| Route | Purpose |
| --- | --- |
| `POST /api/jobs` | Start a workflow run |
| `GET /api/jobs/:id` | Read a job's current state |
| `POST /api/workflow` | QStash's signed workflow endpoint |
| `GET /` | Route index |

</Operations>

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new upstash-workflow --slug upstashworkflow
```

The CLI writes `functions/upstashworkflow/index.ts`, declares the function in `neon.ts`, and adds the QStash keys to `.env.example`.

## Configure Upstash

Create a free account at [console.upstash.com](https://console.upstash.com), open **QStash**, pick a region, and copy all four values from the **Quickstart** section into `.env.local`:

```bash
QSTASH_URL="https://qstash.upstash.io"
QSTASH_TOKEN="eyJVc2VySUQiOi..."
QSTASH_CURRENT_SIGNING_KEY="sig_..."
QSTASH_NEXT_SIGNING_KEY="sig_..."
```

<EnvironmentVariables>

`QSTASH_URL` depends on the region. The EU region uses `https://qstash.upstash.io` or `https://qstash-eu-central-1.upstash.io`, and the US region uses `https://qstash-us-east-1.upstash.io`. The token and signing keys must come from the same region.

The signing keys verify that requests to `/api/workflow` come from QStash, and the token lets `POST /api/jobs` start runs.

</EnvironmentVariables>

## Run locally

Local development uses the QStash CLI, which you start in one terminal:

```bash
npx @upstash/qstash-cli dev
```

It prints a local `QSTASH_URL` (typically `http://127.0.0.1:8080`), token, and signing keys. Put those values in `.env.local` in place of the production ones, then load the file and start the function:

```bash
set -a && . ./.env.local && set +a
neon dev
```

Start a job:

```bash
curl -X POST http://localhost:8787/api/jobs \
  -H 'Content-Type: application/json' \
  -d '{ "jobId": "job_1" }'
```

The job starts in `running`, which you can check right away:

```bash
curl http://localhost:8787/api/jobs/job_1
```

After the 5-second sleep, the same request returns `completed`.

## Deploy

```bash
neon deploy --env .env.local
neon functions get upstashworkflow
```

Then trigger the deployed workflow with the same `curl` and the function URL as the host.

## Notes

- The function creates the `jobs` table on its first run with `CREATE TABLE IF NOT EXISTS`, so there is no migration step.
- `POST /api/jobs` has no authentication in this demo, so anyone with the function URL can start a workflow. Add authentication before you expose it.
- Code outside `context.run` runs again on every step delivery. Put side effects and non-deterministic values inside a step, and return anything a later step needs.
- Add more `context.run` calls around the sleep to extend the workflow. `context.sleep("wait-before-finishing", "5s")` simulates a processing window without keeping the function running.
