<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon Functions and cron jobs

A [Hono](https://hono.dev) API on [Neon Functions](https://neon.com/docs/compute/functions/overview) that increments a counter in [Lakebase Postgres](https://neon.com/docs/postgres/overview) via [Drizzle ORM](https://orm.drizzle.team). A [Function Trigger](https://neon.com/docs/cli/triggers) in `neon.ts` POSTs to `/cron` every minute.

`GET /counter` is public. `POST /cron` only runs when `x-neon-trigger-invocation-id` matches the JSON body's `invocation_id`. Neon sets both on each scheduled delivery.

## Project structure

```
with-cron-job/
├── neon.ts             # Function + cron trigger policy (defineConfig)
├── drizzle.config.ts   # Drizzle Kit config (schema location + DB credentials)
├── tsconfig.json
├── .env.example        # Required environment variables
├── src/
│   ├── index.ts        # Hono app: GET /counter and POST /cron
│   ├── env.ts          # DATABASE_URL helper
│   └── db/
│       ├── client.ts   # pg pool + Drizzle
│       └── schema.ts   # counters table
└── package.json
```

## Clone the repository

```bash
npx degit neondatabase/examples/with-cron-job ./with-cron-job
cd with-cron-job
```

## Install and authenticate the Neon CLI

```bash
npm i -g neon
neon login
```

Use Neon CLI 4.17 or newer so `neon.ts` can declare schedule triggers.

## Install dependencies

```bash
npm install
```

## Link your Neon project

Link (or create) a Neon project by running the `link` command from the workspace root. Functions and triggers need a project in `aws-us-east-2` or `aws-eu-central-1`:

```bash
neon link
```

If you let your agent drive this, add `--agent` to skip interactive mode.

`neon link` pulls your branch-scoped environment variables — including `DATABASE_URL` — into `.env.local`. You can also find your connection string in the [Neon Console](https://console.neon.tech).

## Apply the schema

Push the Drizzle schema to your Neon database:

```bash
npm run db:push
```

## Run locally

```bash
neon dev
```

Then in another shell (use the port `neon-dev` printed):

```bash
# Read the counter
curl http://localhost:8787/counter

# Cron path without the trigger header is rejected
curl -i -X POST http://localhost:8787/cron \
  -H 'content-type: application/json' \
  -d '{}'

# Simulate a scheduled tick
curl -X POST http://localhost:8787/cron \
  -H 'content-type: application/json' \
  -H 'x-neon-trigger-invocation-id: local-dev' \
  -d '{
    "version": 1,
    "invocation_id": "local-dev",
    "trigger": {
      "type": "schedule",
      "id": "trigger-local",
      "name": "every-minute"
    },
    "data": { "scheduled_at": "2026-09-11T00:00:00Z" }
  }'

curl http://localhost:8787/counter
```

## Deploy to Neon Functions

`neon deploy` ships the function and creates the `every-minute` schedule trigger from `neon.ts`:

```bash
neon deploy --env .env.local
```

```ts
preview: {
  functions: {
    cron: {
      name: "Cron Job",
      source: "src/index.ts",
      triggers: [
        {
          type: "schedule",
          name: "every-minute",
          cron: "* * * * *",
          functionPath: "/cron",
        },
      ],
    },
  },
}
```

Change `cron` in `neon.ts` and deploy again to reschedule. List triggers with `neon triggers list`.

## Test your deployed function

```bash
neon functions get cron
```

```bash
curl https://<your-branch>-cron.compute.<region>.aws.neon.tech/counter
```

Wait one minute and call `/counter` again. A `POST /cron` missing `x-neon-trigger-invocation-id`, or with a body whose `invocation_id` does not match that header, returns `401`.

On a deployed function, inbound `x-neon-*` headers from public HTTP are dropped. `x-neon-trigger-invocation-id` only arrives on Function Trigger deliveries. `neon dev` forwards the header so you can simulate a tick locally.
