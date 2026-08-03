<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Stripe webhooks

A [Stripe](https://stripe.com/docs/webhooks) webhook handler on [Neon Functions](https://neon.com/docs/compute/functions/overview), backed by [Neon](https://neon.com) Postgres and [Drizzle ORM](https://orm.drizzle.team).

Verify signatures, store every event idempotently, and project customers + subscriptions into your database — the standard SaaS billing pattern.

## Project structure

```
with-stripe-webhooks/
├── neon.ts             # Neon Functions policy (defineConfig) — what gets deployed
├── drizzle.config.ts   # Drizzle Kit config (schema location + DB credentials)
├── tsconfig.json
├── .env.example        # Required environment variables
├── src/
│   ├── index.ts        # Hono app: webhook handler
│   ├── env.ts          # Stripe + DATABASE_URL helpers
│   └── db/
│       ├── client.ts   # pg pool + Drizzle
│       └── schema.ts   # stripe_events, customers, subscriptions
└── package.json
```

## What it does

| Route | Description |
| ----- | ----------- |
| `POST /webhooks/stripe` | Verify `Stripe-Signature` → claim `stripe_events` by `evt_…` → project customers/subscriptions (single DB transaction) |
| `GET /` | Health + route list |

Handled event types:

- `customer.created` / `customer.updated` / `customer.deleted`
- `customer.subscription.created` / `updated` / `deleted`
- `checkout.session.completed` (ensures customer row when present)

Every event is stored regardless of type so you can inspect retries and add handlers later.

## Clone the repository

```bash
npx degit neondatabase/examples/with-stripe-webhooks ./with-stripe-webhooks
cd with-stripe-webhooks
```

## Install and authenticate the Neon CLI

```bash
npm i -g neon
neon login
```

## Install dependencies

```bash
npm install
```

## Link your Neon project

Link (or create) a Neon project by running the `link` command from the workspace root:

```bash
neon link
```

If you let your agent drive this, add `--agent` to skip interactive mode.

`neon link` pulls your branch-scoped environment variables — including `DATABASE_URL` — into `.env.local`. You can also find your connection string in the [Neon Console](https://console.neon.tech).

## Configure Stripe

`neon link` already wrote `.env.local` with your branch env. Add the Stripe signing secret to that same file (see `.env.example` for the format):

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

**`STRIPE_WEBHOOK_SECRET`** — signing secret from a webhook endpoint (or from `stripe listen` for local dev). Signature verification does **not** need a Stripe API secret key.

## Apply the schema

```bash
npm run db:push
```

## Run locally

```bash
neon dev
```

In another terminal, forward Stripe events with the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:8787/webhooks/stripe
```

Copy the `whsec_…` secret that `stripe listen` prints into `.env.local` as `STRIPE_WEBHOOK_SECRET`, restart `neon dev` if needed, then trigger a test event:

```bash
stripe trigger customer.created
stripe trigger customer.subscription.created
```

Confirm data landed in Postgres (Neon Console SQL Editor, or any client on `DATABASE_URL`):

```sql
SELECT id, type, received_at FROM stripe_events ORDER BY received_at DESC LIMIT 10;
SELECT id, email, name FROM customers ORDER BY updated_at DESC LIMIT 10;
SELECT id, customer_id, status FROM subscriptions ORDER BY updated_at DESC LIMIT 10;
```

## Deploy to Neon Functions

```bash
npm run deploy
# equivalent: neon deploy --env .env.local
```

Grab the invocation URL:

```bash
npm run endpoint
# equivalent: neon functions get stripe
```

## Point Stripe at your deployed function

In the [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks), add an endpoint:

```
https://<your-branch>-stripe.compute.<region>.aws.neon.tech/webhooks/stripe
```

Select the event types listed above (or send all events — unhandled types are stored only).

Copy the endpoint's **signing secret** into `.env.local` as `STRIPE_WEBHOOK_SECRET` and redeploy so production uses the Dashboard secret (not the CLI `whsec_…`).

## Notes

- **Raw body required.** Signature verification uses the exact request bytes. The handler reads `c.req.text()` before any JSON parse.
- **Claim-then-process.** The handler inserts `stripe_events` first (`ON CONFLICT DO NOTHING` on `evt_…`). If the row already exists it returns `{ received: true, duplicate: true }` without re-running projections. Domain work and the event claim run in **one transaction** — a processing failure rolls back the claim so Stripe can retry.
- **Out-of-order events.** Customers and subscriptions store `last_stripe_event_at` (from Stripe `event.created`). Upserts only apply when the incoming event is at least as new as the last applied one, so a delayed older event does not overwrite newer mirror state.
- **Processing failures return 500** so Stripe retries. Duplicates return 200.
