# End-to-end test guide

Full loop: deploy the webhook function to Neon, register it as a Stripe webhook endpoint, create products/prices, complete a real (test-mode) Checkout payment, and verify rows land in Postgres. Also covers idempotency (redelivery) and cancellation.

> Local-only testing with `stripe listen` + `neon dev` is in the [README](README.md#run-locally). This guide tests the **deployed** function.

## Prerequisites

- `npm install` done, `neon login` + `neon link` done (README)
- Stripe CLI installed and logged in (`stripe login`; check with `stripe whoami --format json`)
- Everything below runs in Stripe **test mode** — no live charges

## 0. Know which Neon branch you deploy to

`neon deploy` deploys to the **currently checked-out branch** (see `.neon`). Check with:

```bash
git branch --show-current   # local git branch
neon branches list          # Neon branches
```

Deploying to a dev/feature branch first is recommended. For a "production" deploy: `neon checkout main` (this also rewrites `DATABASE_URL` in `.env.local`).

## 1. Deploy the function

```bash
npm run deploy      # neon deploy --env .env.local
npm run endpoint    # neon functions get stripe
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

## 2. Register the webhook endpoint in Stripe

**Option A — Stripe CLI (scriptable):**

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

**Option B — Dashboard:** [Developers → Webhooks → Add endpoint](https://dashboard.stripe.com/test/webhooks), paste the URL, select the 7 event types above (or send all events — unhandled types are stored, just not projected). Open the endpoint and **Reveal** the signing secret.

## 3. Set the signing secret and redeploy

The secret is baked into the function at deploy time (`neon.ts`), so changing it requires a redeploy:

```bash
# in .env.local
STRIPE_WEBHOOK_SECRET=whsec_<secret-from-step-2>

npm run deploy
```

## 4. Smoke test: synthetic events

`stripe trigger` creates real test-mode objects via the fixtures and fires real webhook deliveries:

```bash
stripe trigger customer.created
```

Verify the row landed (Neon Console SQL Editor on your branch, or `set -a; source .env.local; set +a; psql "$DATABASE_URL"`):

```sql
SELECT id, type, received_at FROM stripe_events ORDER BY received_at DESC LIMIT 5;
SELECT id, email, name FROM customers ORDER BY updated_at DESC LIMIT 3;
SELECT id, customer_id, status, price_id FROM subscriptions ORDER BY updated_at DESC LIMIT 3;
```

Also check delivery status (should be 200) in [Workbench → Webhooks](https://dashboard.stripe.com/test/workbench/webhooks) → your endpoint → **Deliveries**.

Note: trigger-created customers have no email (`null`) and trigger subscriptions show status `incomplete` — that's the fixture data, not a handler problem. A real Checkout payment below produces fully populated rows.

## 5. Create a product, price, and customer

```bash
stripe products create --name "E2E Test Plan" --description "TEST.md walkthrough product"
# -> "id": "prod_…"

stripe prices create --unit-amount 2000 --currency usd \
  -d "recurring[interval]=month" --product prod_…
# -> "id": "price_…"   (note: nested params use -d "key[sub]=value", flat params use --flag)

stripe customers create --email you@example.com --name "E2E Tester"
# -> "id": "cus_…"
```

## 6. Pay through real Checkout (subscription)

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

## 7. Verify the mirror rows

```sql
-- mirror rows created from the checkout flow
SELECT id, email, name, last_stripe_event_at FROM customers WHERE email = 'you@example.com';
SELECT id, customer_id, status, price_id, current_period_end, cancel_at_period_end
  FROM subscriptions ORDER BY updated_at DESC LIMIT 5;
```

Expect: customer row with your email; subscription row with `status = 'active'`, `price_id` = your `price_…`, and a populated `current_period_end`. Every delivered event (200 responses) is also logged in `stripe_events`, including types the handler doesn't project.

## 8. Idempotency: redeliver an event

Stripe retries deliver the **same `evt_…` id**, which the handler claims in `stripe_events` — a redelivery must be a no-op.

```bash
# grab an event id from stripe_events or Workbench, then:
stripe events resend evt_… --webhook-endpoint we_…
```

(`--webhook-endpoint` must be a flag on older CLI versions; `-d "webhook_endpoint=…"` hits a CLI bug. Without it, resend only retries `stripe listen` sessions. Dashboard equivalent: endpoint → Deliveries → event → **Resend**.)

Verify: row count in `stripe_events` and the mirror rows are **unchanged** (the function returned `{ received: true, duplicate: true }`).

## 9. Cancellation flow

```bash
stripe subscriptions list -d "customer=cus_…"     # find sub_…
stripe subscriptions cancel sub_…                  # immediate cancel
```

Expect a `customer.subscription.deleted` (or `.updated` with `cancel_at_period_end=true` if you instead run `stripe subscriptions update sub_… -d "cancel_at_period_end=true"`), and the `subscriptions` mirror row to reflect the new status. Cancel in the [Dashboard](https://dashboard.stripe.com/test/subscriptions) works too.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Deliveries show 400 "invalid signature" | Secret mismatch: the deployed `STRIPE_WEBHOOK_SECRET` doesn't match the endpoint's signing secret. Update `.env.local` and **redeploy** (step 3). |
| Deliveries show 400 "missing stripe-signature header" | Wrong path — URL must end in `/webhooks/stripe`. |
| Deliveries show 500 | Function DB error — check it deployed to the branch whose schema you pushed (`npm run db:push` against the same branch). Stripe will retry 500s automatically. |
| Trigger says "succeeded" but no rows | You deployed before setting the secret (step 3), or you're inspecting a different Neon branch/schema than the function's `DATABASE_URL`. |
| Old event overwrote newer data | Shouldn't happen — upserts are guarded by `last_stripe_event_at`. If it does, that's a bug worth reporting. |

## Cleanup

```bash
stripe webhook_endpoints delete we_…                     # remove the endpoint
stripe products update prod_… -d "active=false"          # archive the test product (prices can't be deleted)
neon branches delete <dev-branch>                        # if you used a throwaway branch (note: branches set with a TTL expire on their own)
neon checkout main                                       # back to main; restores main DATABASE_URL in .env.local
```
