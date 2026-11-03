# Sentry-instrumented API

A small Hono JSON API on Neon Functions that reports to [Sentry](https://sentry.io):

- **Errors** from unhandled route failures, grouped into issues.
- **Logs** for recoverable failures and the order narrative.
- **Traces** for each request, with a child span around the charge attempt.

The template uses fake payment providers, so it runs without a Stripe or Polar account. When `SENTRY_DSN` is empty, the SDK stays disabled and the API still works.

| Route | What it does |
| --- | --- |
| `GET /health` | Returns `{ "status": "ok" }`. |
| `GET /api/orders/:id` | Returns a canned order. |
| `POST /api/orders` | Charges an order through two fake providers. Set `force_failure: true` for a recovered failure. |
| `GET /debug-sentry` | Throws on purpose and returns `500`, producing an issue in Sentry. |

## Scaffold it

```bash
npm install -g neon@latest
neon login
neon link
neon functions new sentry
```

This template has no `operations`, so the CLI copies its single module as `index.ts` and declares the function in `neon.ts`. Sentry is initialized once, at module load.

Create a Node.js project in Sentry and copy its DSN. Then add it to `.env.local`:

```bash
echo "SENTRY_DSN=https://examplePublicKey@o0.ingest.us.sentry.io/0" >> .env.local
```

`neon deploy` requires every declared function variable to have a value, so `SENTRY_DSN` must be present in `.env.local`. To try the API without Sentry, set it to an empty value instead; the SDK stays disabled:

```bash
echo "SENTRY_DSN=" >> .env.local
```

Deploy:

```bash
neon deploy --env .env.local
```

## Run locally

```bash
neon dev
```

`neon dev` loads `.env.local`, so the locally running function reports to the same Sentry project. Call the URL it prints. The examples below use `$URL`.

### Health check

```bash
curl "$URL/health"
```

### Recovered failure: warning log, no issue

```bash
curl -X POST "$URL/api/orders" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"sku":"PRL-KIT","qty":2}],"force_failure":true}'
```

The response is `200` with `"provider":"polar"`. The first provider fails and is logged with `Sentry.logger.warn`, then the second provider succeeds. Check **Explore > Logs** in Sentry for `payment provider failed, trying the next one`.

### Trace: the request and its charge span

```bash
curl -X POST "$URL/api/orders" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"sku":"PRL-KIT","qty":2}]}'
```

Check **Explore > Traces** for the `POST /api/orders` root span with the `order.charge` child span.

### Issue: an unhandled error

```bash
curl -i "$URL/debug-sentry"
```

This returns `500` with `{"error":"internal_error"}`. Check **Issues** for the grouped error.

## How it is wired

- `Sentry.init()` runs once at module load with `enabled: Boolean(SENTRY_DSN)` and `tracesSampleRate: 1`. This SDK version captures `Sentry.logger` calls without a separate logs flag.
- `httpIntegration({ disableIncomingRequestSpans: true })` is required because Neon Functions are not served by `node:http`. The middleware creates the request root span.
- The middleware wraps every request in `Sentry.withIsolationScope()` and `Sentry.startSpan()`, then calls `Sentry.flush(2000)` in `finally` because an idle function can be suspended at any time.
- `environment` comes from the injected `NEON_BRANCH`: `main` is tagged `production`, and preview branches use their branch name.
- `SENTRY_DSN` is the only declared variable. `NEON_BRANCH` and the other Neon variables are injected and must not be declared.

Neon Functions do not emit source maps today, so Sentry stack traces point at bundle positions. Errors, logs, and traces are still grouped correctly.

Letting the SDK read `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`, or `PRODUCTION_BRANCH` would make those required variables in `neon.ts` and block a deploy when unset. The template reads only `SENTRY_DSN` and keeps the sample rate at `1`, which suits a low-traffic demo. Add those variables deliberately if you want release tracking or sampling.
