# Sentry-instrumented API

A [Neon Function](https://neon.com/docs/compute/functions/overview) that reports to [Sentry](https://sentry.io):

- **Errors** from unhandled route failures, grouped into issues.
- **Logs** for recovered failures and for the todo lifecycle.
- **Traces** for each request, with a child span around the save.

The API is a [Hono](https://hono.dev) app with an in-memory todo store.

## Scaffold it

```bash
npm install -g neon@latest
neon login
neon link
neon functions new sentry
```

The CLI writes `functions/sentry/index.ts`, declares `sentry` in `neon.ts`, and installs `@sentry/node` and `hono`. The template has no `operations`, so the CLI copies its single module as `index.ts`. The module initializes Sentry once, when it loads.

## Configure Sentry

<EnvironmentVariables>

- `SENTRY_DSN`: The DSN from your Sentry project settings. Leave it empty (`SENTRY_DSN=`) to keep the SDK disabled. The function still runs without it.

</EnvironmentVariables>

Create a Node.js project in Sentry and copy its DSN. Add it to `.env.local`:

```bash
echo "SENTRY_DSN=https://examplePublicKey@o0.ingest.us.sentry.io/0" >> .env.local
```

`SENTRY_DSN` is declared `required: false`, so `neon deploy` and `neon dev` run without it and the SDK stays disabled. An empty value (`SENTRY_DSN=`) does the same, and removes a DSN that an earlier deploy set.

## Run locally

```bash
neon dev
```

`neon dev` loads `.env.local`, so the local function reports to the same Sentry project. Call the URL it prints. The examples below use `$URL` for it.

### Health check

```bash
curl "$URL/health"
```

### Log a recovered failure

```bash
curl -X POST "$URL/todos" \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy milk","simulate_retry":true}'
```

The response is `201` with the new todo. The first save attempt fails, the function logs it with `Sentry.logger.warn`, and the retry succeeds. Sentry records the failure as a log, not an issue. Check **Explore > Logs** in Sentry for `first save attempt failed, retrying`.

### Trace a request and its save span

```bash
curl -X POST "$URL/todos" \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy milk"}'
```

Check **Explore > Traces** for the `POST /todos` root span with the `todo.save` child span.

### Report an unhandled error as an issue

```bash
curl -i "$URL/debug-sentry"
```

This returns `500` with `{"error":"internal_error"}`. Check **Issues** for the grouped error. The SDK's default Dedupe integration drops an error identical to the one just before it, so calling this route again on the same instance doesn't send a second event.

## Routes

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/` | The template name and route list |
| `GET` | `/health` | `{ "status": "ok" }` |
| `GET` | `/todos/:id` | A todo saved earlier in this instance, or `404` if the id is unknown |
| `POST` | `/todos` | Saves a todo in memory. With `simulate_retry: true`, it also logs a recovered failure |
| `GET` | `/debug-sentry` | Throws on purpose, returns `500`, and creates an issue in Sentry |

## Deploy

```bash
neon deploy --env .env.local
neon functions get sentry
```

`neon functions get` prints the function's public URL. Call the same routes against it, replacing `$URL`.

## How it works

- `Sentry.init()` runs once at module load with `enabled: Boolean(SENTRY_DSN)` and `tracesSampleRate: 1`.
- `SIGTERM` and `SIGINT` handlers flush buffered telemetry when the runtime shuts the process down.
- `httpIntegration({ disableIncomingRequestSpans: true })` is required because `node:http` does not serve Neon Functions. The middleware creates the request root span.
- The middleware wraps every request in `Sentry.withIsolationScope()` and `Sentry.startSpan()`, then calls `Sentry.flush(2000)` in `finally` because an idle function can be suspended at any time.
- `environment` comes from the injected `NEON_BRANCH`. Events from `main` report as `production`, and preview branches report their branch name.
- `SENTRY_DSN` is the only declared variable. `NEON_BRANCH` and the other Neon variables are injected and must not be declared.
- The todo store is a plain `Map`. A saved todo is visible to later requests on the same function instance, and nothing persists when the runtime recycles that instance.

## Notes

- Function URLs are public. Anyone with the URL can call `/debug-sentry` and create events against your Sentry quota, and the in-memory store grows with every `POST /todos`. Remove the debug route and use a real database before you ship this.
- Neon Functions do not emit source maps today, so Sentry stack traces point at bundle positions. Errors, logs, and traces are still grouped correctly.
