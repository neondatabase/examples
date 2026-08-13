<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Stripe webhooks

A [Stripe](https://stripe.com/docs/webhooks) webhook handler on [Neon Functions](https://neon.com/docs/compute/functions/overview), backed by [Neon](https://neon.com) Postgres and [Drizzle ORM](https://orm.drizzle.team).

Verify signatures, store every event idempotently, and project customers + subscriptions into your database: the standard SaaS billing pattern.

## Project structure

```
with-stripe-webhooks/
├── neon.ts             # Neon Functions policy (defineConfig) - what gets deployed
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

For non-interactive use (e.g., CI or an AI agent), add `--agent` to skip interactive mode.

`neon link` pulls your branch-scoped environment variables (including `DATABASE_URL`) into `.env.local`. You can also find your connection string in the [Neon Console](https://console.neon.tech).

## Configure Stripe

`neon link` already wrote `.env.local` with your branch env. Add the Stripe signing secret to that same file (see `.env.example` for the format):

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

**`STRIPE_WEBHOOK_SECRET`**: signing secret from a webhook endpoint (or from `stripe listen` for local dev). Signature verification does **not** need a Stripe API secret key.

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

Copy the `whsec_…` secret that `stripe listen` prints into `.env.local` as `STRIPE_WEBHOOK_SECRET`, restart `neon dev`, then trigger a test event:

```bash
stripe trigger customer.created
stripe trigger customer.subscription.created
```

Confirm the rows are in your database by connecting with `psql` or the [Neon Console's SQL Editor](https://neon.com/docs/get-started/query-with-neon-sql-editor):

```sql
SELECT id, type, received_at FROM stripe_events ORDER BY received_at DESC LIMIT 10;
SELECT id, email, name FROM customers ORDER BY updated_at DESC LIMIT 10;
SELECT id, customer_id, status FROM subscriptions ORDER BY updated_at DESC LIMIT 10;
```

## Deploy to Neon Functions

`neon deploy` deploys to the **currently checked-out branch** (see `.neon`). Check with:

```bash
git branch --show-current   # local git branch
neon branches list          # Neon branches
```

Deploying to a dev/feature branch first is recommended. For a "production" deploy: `neon checkout production` (this also rewrites `DATABASE_URL` in `.env.local`).

```bash
npm run deploy
# equivalent: neon deploy --env .env.local
```

Grab the invocation URL:

```bash
npm run endpoint
# equivalent: neon functions get stripe
```

The deploy output prints the function URL, e.g.:

```
https://<branch-id>-stripe.compute.<region>.aws.neon.tech/
```

Your webhook URL is that base URL plus `/webhooks/stripe`. Sanity check:

```bash
curl https://<branch-id>-stripe.compute.<region>.aws.neon.tech/
# {"ok":true,"service":"stripe-webhooks",...}
```

## Test end-to-end (deployed)

Full loop: register the function as a Stripe webhook endpoint, create products/prices, complete a real (test-mode) Checkout payment, and verify rows land in Postgres. Also covers idempotency (redelivery) and cancellation. Everything runs in Stripe **test mode**, so there are no live charges.

### 1. Register the webhook endpoint in Stripe

**Option A: Stripe CLI**

```bash
stripe webhook_endpoints create \
  --url "https://<branch-id>-stripe.compute.<region>.aws.neon.tech/webhooks/stripe" \
  --enabled-events "customer.created" \
  --enabled-events "customer.updated" \
  --enabled-events "customer.deleted" \
  --enabled-events "customer.subscription.created" \
  --enabled-events "customer.subscription.updated" \
  --enabled-events "customer.subscription.deleted" \
  --enabled-events "checkout.session.completed"
```

Copy `secret` (`whsec_…`) and the endpoint `id` (`we_…`) from the JSON response.

**Option B: Dashboard** [Developers → Webhooks → Add endpoint](https://dashboard.stripe.com/test/webhooks), paste the URL, select the 7 event types above (or send all events; unhandled types are stored, just not projected). Open the endpoint and **Reveal** the signing secret.

### 2. Set the signing secret and redeploy

The secret is baked into the function at deploy time (`neon.ts`), so changing it requires a redeploy:

```text
# Add to .env.local:
STRIPE_WEBHOOK_SECRET=whsec_<secret-from-step-1>
```

Deploy the function with the new secret:

```bash
npm run deploy
```

### 3. Smoke test: synthetic events

`stripe trigger` creates real test-mode objects via the fixtures and fires real webhook deliveries:

```bash
stripe trigger customer.created
```

Verify the row landed (the Neon Console's SQL Editor on your branch, or `set -a; source .env.local; set +a; psql "$DATABASE_URL"`):

```sql
SELECT id, type, received_at FROM stripe_events ORDER BY received_at DESC LIMIT 5;
SELECT id, email, name FROM customers ORDER BY updated_at DESC LIMIT 3;
SELECT id, customer_id, status, price_id FROM subscriptions ORDER BY updated_at DESC LIMIT 3;
```

Also check delivery status (should be 200) in [Workbench → Webhooks](https://dashboard.stripe.com/test/workbench/webhooks) → your endpoint → **Deliveries**.

Note: trigger-created customers have no email (`null`) and trigger subscriptions show status `incomplete`; that's the fixture data, not a handler problem. A real Checkout payment below produces fully populated rows.

### 4. Create a product, price, and customer

```bash
stripe products create --name "E2E Test Plan" --description "Test subscription plan for Neon Functions + Stripe webhooks example"

# -> "id": "prod_…"

stripe prices create --unit-amount 2000 --currency usd \
  -d "recurring[interval]=month" --product "prod_…"

# -> "id": "price_…"

stripe customers create --email you@example.com --name "E2E Tester"

# -> "id": "cus_…"
```

### 5. Pay through real Checkout (subscription)

```bash
stripe checkout sessions create \
  --mode subscription \
  --customer cus_… \
  -d "line_items[0][price]=price_…" \
  -d "line_items[0][quantity]=1" \
  --success-url "https://example.com/success" \
  --cancel-url "https://example.com/cancel"
```

Open the `url` from the response in a browser and pay with the test card **4242 4242 4242 4242**, any future expiry, any CVC/ZIP.

Expected event sequence delivered to your function: `customer.created` → `customer.updated` → `checkout.session.completed` → `customer.subscription.created`.

### 6. Verify the mirror rows

```sql
-- mirror rows created from the checkout flow
SELECT id, email, name, last_stripe_event_at FROM customers WHERE email = 'you@example.com';
SELECT id, customer_id, status, price_id, current_period_end, cancel_at_period_end
  FROM subscriptions ORDER BY updated_at DESC LIMIT 5;
```

Expect: customer row with your email; subscription row with `status = 'active'`, `price_id` = your `price_…`, and a populated `current_period_end`. Every delivered event (200 responses) is also logged in `stripe_events`, including types the handler doesn't project.

### 7. Idempotency: redeliver an event

Stripe retries deliver the **same `evt_…` id**, which the handler claims in `stripe_events`; a redelivery must be a no-op.

```bash
# grab an event id from stripe_events or Workbench, then:
stripe events resend evt_… --webhook-endpoint we_…
```

> Retrieve Webhook endpoint ID from the Stripe Dashboard or CLI. The `stripe events resend` command requires the event ID and the webhook endpoint ID.

Verify: row count in `stripe_events` and the mirror rows are **unchanged** (the function returned `{ received: true, duplicate: true }`).

### 8. Cancellation flow

```bash
stripe subscriptions list -d "customer=cus_…"     # find sub_…
stripe subscriptions cancel sub_…                  # immediate cancel
```

Expect a `customer.subscription.deleted` (or `.updated` with `cancel_at_period_end=true` if you instead run `stripe subscriptions update sub_… -d "cancel_at_period_end=true"`), and the `subscriptions` mirror row to reflect the new status. Cancel in the [Dashboard](https://dashboard.stripe.com/test/subscriptions) works too.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Deliveries show 400 "invalid signature" | Secret mismatch: the deployed `STRIPE_WEBHOOK_SECRET` doesn't match the endpoint's signing secret. Update `.env.local` and **redeploy** (step 2 of testing). |
| Deliveries show 400 "missing stripe-signature header" | Wrong path: URL must end in `/webhooks/stripe`. |
| Deliveries show 500 | Function DB error: check it deployed to the branch whose schema you pushed (`npm run db:push` against the same branch). Stripe will retry 500s automatically. |
| Trigger says "succeeded" but no rows | You deployed before setting the secret (step 2 of testing), or you're inspecting a different Neon branch/schema than the function's `DATABASE_URL`. |

## Notes

- **Raw body required.** Signature verification uses the exact request bytes. The handler reads `c.req.text()` before any JSON parse.
- **Claim-then-process.** The handler inserts `stripe_events` first (`ON CONFLICT DO NOTHING` on `evt_…`). If the row already exists it returns `{ received: true, duplicate: true }` without re-running projections. Domain work and the event claim run in **one transaction**; a processing failure rolls back the claim so Stripe can retry.
- **Out-of-order events.** Customers and subscriptions store `last_stripe_event_at` (from Stripe `event.created`). Upserts only apply when the incoming event is at least as new as the last applied one, so a delayed older event does not overwrite newer mirror state.
- **Soft delete.** `customer.deleted` is a soft delete: the `customers` row is kept (subscriptions reference it via FK) but `name` and `email` are set to `NULL`. Note Stripe sends the full customer snapshot (with `name`/`email`) for this event, so the handler nulls PII based on the event type.
- **Processing failures return 500** so Stripe retries. Duplicates return 200.
