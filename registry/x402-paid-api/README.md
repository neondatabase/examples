# Paid API with x402 and Hono

A pay-per-request JSON API running as a [Neon Function](https://neon.com/docs/compute/functions/overview). `GET /premium` is protected by [x402](https://x402.org): callers pay a small amount of testnet USDC on Base Sepolia, and every settlement is written to [Lakebase Postgres](https://neon.com/lakebase).

- [Hono](https://hono.dev) handles routing and JSON responses.
- [`@x402/hono`](https://www.npmjs.com/package/@x402/hono) returns `402 Payment Required` and verifies payments through an x402 facilitator. [`@x402/evm`](https://www.npmjs.com/package/@x402/evm) provides the `exact` EVM payment scheme.
- [`pg`](https://node-postgres.com) stores the payment ledger. `DATABASE_URL` is injected from the linked branch by Neon.

The template is API-only: API clients get a JSON `402` with the payment requirements. A browser gets the x402 middleware's HTML payment page instead, because browsers send `Accept: text/html`.

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new x402-paid-api --slug paidapi
```

The CLI writes `functions/paidapi/index.ts`, declares `paidapi` in `neon.ts`, and adds `X402_EVM_ADDRESS` to `.env.example`.

`neon.ts` passes the address through as a function env variable:

```ts
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  functions: {
    paidapi: {
      name: "Paid API with x402 and Hono",
      source: "./functions/paidapi/index.ts",
      env: { X402_EVM_ADDRESS: process.env.X402_EVM_ADDRESS! },
    },
  },
});
```

## Set the receiving address

Add an EVM address you control to `.env.local`:

```bash
printf 'X402_EVM_ADDRESS=%s\n' "0xYourAddress" >> .env.local
```

`X402_EVM_ADDRESS` is a public receiving address, not a secret. It does not need funds. The buyer needs Base Sepolia USDC from a [faucet](https://faucet.circle.com/). On mainnet, use a real receiving address.

## Run locally

```bash
neon dev
```

Call the URL that `neon dev` prints (the default is `http://localhost:8787/`):

```bash
# Describe the API
curl http://localhost:8787/

# Get the payment requirements
curl -i http://localhost:8787/premium
```

The second request returns `402 Payment Required` with a `PAYMENT-REQUIRED` header. The first `/premium` request also fetches the facilitator's `/supported` endpoint; if the facilitator is unreachable, the route returns `503`.

The ledger is empty until a payment settles:

```bash
curl http://localhost:8787/stats
# {"count":0,"totalUsd":"0","lastSettlementAt":null}
```

`/stats` returns the number of settled payments, total USD, and the latest settlement time. `GET /stats` or the first settled payment creates the `x402_payments` table in the linked Postgres branch, so there is no migration step.

To complete a payment, use an x402 buyer client with a funded Base Sepolia wallet. See the [x402 buyer quickstart](https://docs.x402.org/getting-started/quickstart-for-buyers). After a successful paid request, `/stats` includes the settlement.

## Routes

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/` | API name, network, price, route list, and buyer setup links |
| `GET` | `/premium` | The paid JSON response, or `402` with payment instructions |
| `GET` | `/stats` | Number of settled payments, total USD, and the latest settlement time |

Non-`GET` requests to `/premium` return `405`. A single trailing slash (`/premium/`) is accepted as `/premium`; paths with duplicate slashes and any other path return `404`.

## Customize

The defaults are constants at the top of `functions/paidapi/index.ts`:

```ts
const NETWORK = "eip155:84532"; // Base Sepolia
const PRICE = "$0.001";
const FACILITATOR_URL = "https://x402.org/facilitator";
```

- **Network:** for mainnet, change `NETWORK` to `eip155:8453`, use a mainnet receiving address, and use a mainnet facilitator. `https://x402.org/facilitator` is testnet-only. The CDP facilitator at `https://api.cdp.coinbase.com/platform/v2/x402` requires CDP API credentials and returns `401` without them. Use `createCdpFacilitatorClient` from `@coinbase/cdp-sdk`, which signs a JWT from `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET`, or pass an equivalent `createAuthHeaders` callback to `HTTPFacilitatorClient`. Add those variables to the function env in `neon.ts` and to `.env.local`.
- **Price:** `PRICE` is a USD string. The template uses testnet USDC; test the full payment flow before switching to mainnet.

## Deploy

```bash
neon deploy --env .env.local
neon functions get paidapi
```

`--env .env.local` lets `neon.ts` resolve `X402_EVM_ADDRESS` before deployment. `neon functions get` prints the function's public URL. Call the same routes there:

```bash
curl -i https://<function-url>/premium
```

## Data model

`GET /stats` or the first settled payment creates the ledger:

```sql
CREATE TABLE IF NOT EXISTS x402_payments (
  id bigserial PRIMARY KEY,
  transaction text NOT NULL,
  network text NOT NULL,
  payer text,
  amount_atomic text NOT NULL,
  amount_usd numeric(20, 6) NOT NULL,
  asset text NOT NULL,
  resource text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS x402_payments_transaction_key
  ON x402_payments (transaction);
```

The x402 `onAfterSettle` hook inserts one row per settled payment with `ON CONFLICT (transaction) DO NOTHING`, so a retried settlement cannot double-count. The write is best-effort: if it fails, the error is logged but the already-settled response is still returned.

## Notes

- A Neon Function URL is public. `/` and `/stats` are free; only `/premium` is gated by payment.
- `/stats` is public too. Protect it by adding a secret token as a headers check if you want to restrict access.
