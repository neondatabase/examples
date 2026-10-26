## Neon

By default, when using the Neon CLI, always use the project `[PROJECT NAME]` (id: `[PROJECT ID]`).

## This project

Daily event totals, recomputed by a Neon schedule trigger. The sections below cover calling it and changing it.

- `src/` is the function: `app.ts` routes requests, `rollup.ts` holds the rollup SQL.
- `migrations/` holds the schema. Add new files; never edit applied ones.
- `neon.ts` declares the function and its schedule, and runs migrations plus a smoke test after every `neon deploy`.
- Deploy with `npm run deploy` (`neon deploy --env .env.local`). `ROLLUP_API_KEY` and `ROLLUP_CRON` live in `.env.local`.

## Neon scheduled rollup

This project is a Neon Function (`rollup`) plus a schedule trigger (`daily-rollup` in `neon.ts`). Each run recomputes the last two UTC days of `rollup.daily_totals` from `rollup.events` and records the run in `rollup.runs`. Totals are absolute counts, so a repeated or late run can't double-count, and a missed run is caught up by the next one.

Your backend calls the `/v1` API with `Authorization: Bearer $ROLLUP_API_KEY` (in `.env.local`; never commit it). Find the URL with `neon functions get rollup`.

- `POST /v1/events` with `{}` or `{ "occurred_at": "2026-10-26T12:00:00Z" }` records an event.
- `GET /v1/daily-totals?days=7` returns `{ "totals": [{ "day", "event_count" }] }`.
- `POST /v1/rollup` recomputes now instead of waiting for the schedule.

### Change the schedule

Set `ROLLUP_CRON` in `.env.local` (UTC cron, default `5 0 * * *`), then `neon deploy --env .env.local`. List triggers with `neon triggers list`.

### Add your own scheduled work

The trigger POSTs to `/schedule`. `src/app.ts` parses it with `parseTriggerDelivery` from `@neon/functions/triggers`, which checks the trigger header Neon sets. Trigger retries are off by default: a non-2xx response is final, so make each run safe to repeat and able to catch up, as `rollup()` does. Schema changes go in a new `migrations/` file; `neon deploy` applies it.
