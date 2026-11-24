# Alert on SQL thresholds

This Neon Function runs SQL on a schedule and posts to Slack when the result crosses a threshold.

## Scaffold it

```bash
npm install -g neon@latest
neon login
neon link
neon functions new sql-alerts
```

The CLI writes `functions/sqlalerts/index.ts`, declares the function in `neon.ts`, and adds `SLACK_WEBHOOK_URL` to `.env.example`.

A template cannot add a trigger for you. Add the schedule next to `functions` in `neon.ts`, then deploy again:

```typescript
triggers: {
  "alert-checks": {
    type: "schedule",
    function: "sqlalerts",
    cron: "0 * * * *", // hourly
    functionPath: "/run",
  },
},
```

You can also create the same trigger with the [Neon CLI](https://neon.com/docs/cli/triggers#create) once the function is deployed:

```bash
neon triggers create --function-slug sqlalerts --name alert-checks \
  --cron '0 * * * *' --function-path /run
```

The cron uses five fields in UTC and cannot run more than once a minute. A check that stays over its threshold sends a message on every run.

| Cron           | Messages while a check is over its threshold |
| -------------- | -------------------------------------------- |
| `0 * * * *`    | Hourly, the default                          |
| `0 */6 * * *`  | Every six hours                              |
| `0 9 * * 1-5`  | Once each weekday morning                    |
| `*/15 * * * *` | Every fifteen minutes                        |

## Configure

Create an [incoming webhook](https://api.slack.com/messaging/webhooks) for the channel that should get the alerts and copy its URL. Add it to `.env.local`, keeping the Neon values already there:

```bash
echo "SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T000/B000/XXXX" >> .env.local
```

<EnvironmentVariables>

- `SLACK_WEBHOOK_URL`: Slack incoming webhook URL for the channel that should get the alerts.

</EnvironmentVariables>

## Routes

| Method | Path   | Auth                       | Purpose                                                           |
| ------ | ------ | -------------------------- | ----------------------------------------------------------------- |
| `POST` | `/run` | Neon trigger delivery only | Run every check and post a message when one is over its threshold |
| `GET`  | `/`    | None                       | The function name, checks, and route list                         |

`POST /run` only accepts a trigger delivery. `parseTriggerDelivery` checks that the `x-neon-trigger-invocation-id` header is present and matches `invocation_id` in the body. That match is a consistency check, not a signature. Neon strips `X-Neon-*` headers from requests that callers send, so a request that carries the header came from Neon's trigger system.

## Run locally

```bash
neon dev
```

`neon dev` serves only Functions, and `/run` needs a trigger delivery, so send one yourself. It posts to `SLACK_WEBHOOK_URL` for anything over its threshold.

```bash
curl -s -X POST http://localhost:8787/run \
  -H 'content-type: application/json' \
  -H 'x-neon-trigger-invocation-id: local-dev' \
  -d '{
    "version": 1,
    "invocation_id": "local-dev",
    "trigger": { "type": "schedule", "id": "trigger-local", "name": "alert-checks" },
    "data": { "scheduled_at": "2026-01-01T00:00:00Z" }
  }'
```

```json
{
  "ok": true,
  "checked": 2,
  "notified": 0,
  "results": [
    { "id": "long-running-queries", "ok": true, "value": 0, "firing": false },
    { "id": "idle-in-transaction", "ok": true, "value": 0, "firing": false }
  ]
}
```

Without the header `/run` returns `401`, and a malformed body returns `400`. A check whose SQL fails does not stop the others: its result shows `ok: false`, the route returns `502`, and the error goes to the logs.

```bash
neon logs query --source function --service-name neon-function/sqlalerts
```

## Deploy

```bash
neon deploy --env .env.local
neon functions get sqlalerts
neon triggers list
```

The deploy creates the schedule trigger from `neon.ts`. The first run happens at the next top of the hour, which `neon triggers list` shows as `Next Run At`. Each run appears in the logs as an `invoke begin` and `invoke end` pair, and a check that is past its threshold also posts to Slack.

Until Function Triggers is enabled for the project, `neon deploy` returns `404` with `function triggers not available for this project`. Deploy the function alone with `neon functions deploy sqlalerts --src functions/sqlalerts/index.ts`, then create the trigger with `neon triggers create` or the `neon.ts` block once Function Triggers is enabled.

## Customize it

### Which checks run

Edit the `CHECKS` list at the top of `functions/sqlalerts/index.ts`. Each entry has a unique `id`, a `title` used in the message, one SQL statement, an `operator`, and a `threshold`:

```typescript
{
  id: "failed-payments",
  title: "Failed payments in the last hour",
  sql: "select count(*)::int from payments where status = 'failed' and created_at > now() - interval '1 hour'",
  operator: ">",
  threshold: 5,
},
```

The query must return one row with one numeric column. It runs in a read-only transaction with a 15-second `statement_timeout`, so a bad query fails that check instead of changing data or holding up the run. Delete an entry to stop checking it.

The template has two checks: one for long-running queries and one for idle transactions. Change the SQL, operator, and threshold to suit your own needs.

## Notes

- Each run sends one message for every check that is past its threshold. No state is persisted between runs, so a check that stays past its threshold sends a message on every run. Messages stop once the value is back inside the threshold. Trigger deliveries can also repeat, which can produce duplicate messages. Make the receiving side tolerant of duplicates, or keep a table that records which alerts already went out.
- A check that fails makes `/run` return `502`. Neon treats any response other than `2xx` as a failed delivery and retries it, so the retry runs every check again. Fix a failing query as soon as the logs show it, or disable the trigger until you do.
- Cron jobs run at most once per minute.
