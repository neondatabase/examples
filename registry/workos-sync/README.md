# Mirror WorkOS data into Postgres

Keeps a copy of your WorkOS users, organizations, memberships, directories, and more in the branch's Postgres, so you can join them with your own tables in SQL. [WorkOS Postgres Sync](https://github.com/workos/sync-engine) does the work: a backfill loads what already exists, a poll of the Events API keeps it current, and a periodic reconcile catches drift the event stream cannot see. Function Triggers run each piece on a schedule, and a WorkOS webhook makes the function poll right away.

## How it works

| Route                   | Called by                         | Purpose                                                                         |
| ----------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| `POST /tick`            | schedule trigger, every minute    | Poll the Events API once and apply what is new                                  |
| `POST /backfill`        | schedule trigger, every 5 minutes | Load one slice of existing data; a no-op once every stream is complete          |
| `POST /reconcile`       | schedule trigger, hourly          | Continue the reconcile pass in progress and repair drift; a no-op once complete |
| `POST /reconcile/fresh` | schedule trigger, weekly          | Start a new reconcile pass                                                      |
| `POST /webhook`         | WorkOS                            | Verify the delivery's signature, then poll now                                  |
| `GET /status`           | you, with a bearer token          | Per-stream counts, poll age, and lag                                            |
| `GET /`                 | you                               | Route index                                                                     |

Every invocation is bounded, idempotent, and resumable, so short triggers keep the mirror current instead of one long-lived process. Trigger routes accept only Neon trigger deliveries. The webhook route accepts only deliveries signed with your endpoint's secret, and the status route needs a token you choose. The mirror is a read model: read from it for joins, dashboards, and analytics, and keep writes on the WorkOS API.

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new workos-sync --slug workossync
```

The CLI writes `functions/workossync/index.ts`, declares the function in `neon.ts`, and adds the WorkOS variables to `.env.example`.

## Configure WorkOS

1. In the [WorkOS Dashboard](https://dashboard.workos.com), open **API Keys** and create a secret key for the environment to mirror.
2. Add the three values to `.env.local`, keeping the Neon values already there. The webhook secret can be a placeholder until the endpoint exists, below. The status token is anything long and random; it guards `GET /status` because function URLs are public.

```bash
echo 'WORKOS_API_KEY=sk_...' >> .env.local
echo 'WORKOS_WEBHOOK_SECRET=placeholder' >> .env.local
echo "WORKOS_SYNC_STATUS_TOKEN=$(openssl rand -hex 32)" >> .env.local
```

## Schedule it

Add `triggers` next to `functions` in `neon.ts`. Trigger names must be unique on the branch.

```typescript
export default defineConfig({
  functions: {
    workossync: {
      name: "Mirror WorkOS data into Postgres",
      source: "./functions/workossync/index.ts",
      env: {
        WORKOS_API_KEY: { value: process.env.WORKOS_API_KEY, required: true },
        WORKOS_WEBHOOK_SECRET: { value: process.env.WORKOS_WEBHOOK_SECRET, required: true },
        WORKOS_SYNC_STATUS_TOKEN: { value: process.env.WORKOS_SYNC_STATUS_TOKEN, required: true },
      },
    },
  },
  triggers: {
    "workos-tick": {
      type: "schedule",
      function: "workossync",
      cron: "* * * * *",
      functionPath: "/tick",
    },
    "workos-backfill": {
      type: "schedule",
      function: "workossync",
      cron: "*/5 * * * *",
      functionPath: "/backfill",
    },
    "workos-reconcile": {
      type: "schedule",
      function: "workossync",
      cron: "30 * * * *",
      functionPath: "/reconcile",
    },
    "workos-reconcile-fresh": {
      type: "schedule",
      function: "workossync",
      cron: "0 3 * * 0",
      functionPath: "/reconcile/fresh",
    },
  },
});
```

`tick` takes a lease, so an overlapping tick exits early and reports `skipped`. The other routes take no lease and run safely alongside it.

## Deploy

```bash
neon deploy --env .env.local
neon functions get workossync
```

The first `/backfill` delivery creates the schema and starts loading. `/tick` runs every minute from then on.

## Point a webhook at it

1. In the WorkOS Dashboard, open **Webhooks** and add an endpoint whose URL is the function's `invocation_url` plus `/webhook`. Select any events; the delivery is only a nudge to poll, so the selection does not change what is mirrored.
2. Copy the endpoint's signing secret into `.env.local` as `WORKOS_WEBHOOK_SECRET` and run `neon deploy --env .env.local` again.

## Try it

```bash
curl -H "Authorization: Bearer $WORKOS_SYNC_STATUS_TOKEN" <invocation_url>/status
```

Then query the mirror. The `_live` views hide deleted rows; the base tables keep them as tombstones.

```sql
SELECT o.name AS organization, u.email, m.role_slug
  FROM workos.organization_memberships_live m
  JOIN workos.users_live u ON u.id = m.user_id AND u._env = m._env
  JOIN workos.organizations_live o ON o.id = m.organization_id AND o._env = m._env;
```

## Run locally

`neon dev` loads `.env.local` and injects `DATABASE_URL` from the linked branch:

```bash
neon dev
```

Simulate a trigger delivery. `neon dev` forwards the header that the deployed proxy strips from outside callers:

```bash
curl -X POST http://localhost:8787/backfill \
  -H 'content-type: application/json' \
  -H 'x-neon-trigger-invocation-id: local-dev' \
  -d '{"version":1,"invocation_id":"local-dev","trigger":{"type":"schedule","id":"trigger-local","name":"workos-backfill"},"data":{"scheduled_at":"2026-01-01T00:00:00Z"}}'
```

Repeat with `/tick`, `/reconcile/fresh`, and `/reconcile`, then read the result:

```bash
curl -H "Authorization: Bearer $WORKOS_SYNC_STATUS_TOKEN" http://localhost:8787/status
```

## Notes

- `GET /status` reports row counts and timestamps, not row contents.
- `MAX_PAGES` and `MAX_EVENTS_PER_TICK` at the top of the module bound each invocation. Each response reports `pages`. Raise the budget until a slice uses most of the 15-minute limit but still finishes before the next trigger fires.
- A reconcile cannot pause inside a stream, so a stream whose listing alone outlasts the budget runs to its last page. Reconcile that stream once from the CLI with `npx workos-sync-postgres reconcile --repair --streams <name>` against the same `DATABASE_URL`, and let the scheduled slices cover the rest.
- Every row carries an `_env` column, set from `ENVIRONMENT` at the top of the module. Rename it to match the WorkOS environment, or add entries to `environments` to mirror several.
- The injected pooled `DATABASE_URL` is fine; the engine works in short transactions and holds at most one connection per phase.
- The [sync-engine docs](https://github.com/workos/sync-engine/tree/main/docs) cover the schema, the consistency model, and operations.
