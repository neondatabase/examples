/**
 * Paid API with x402 and Hono.
 *
 * GET /         Free API info.
 * GET /premium  $0.001 in testnet USDC on Base Sepolia; 402 until paid.
 * GET /stats    Settlement totals. Needs DATABASE_URL from `neon link`.
 *
 * Set X402_EVM_ADDRESS to an EVM address you control. Buyers need Base Sepolia
 * USDC and an x402 client:
 * https://docs.x402.org/getting-started/quickstart-for-buyers
 *
 * Change NETWORK, PRICE, and FACILITATOR_URL below for mainnet.
 */

import { attachDatabasePool } from "@neon/functions";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { RoutesConfig } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
	paymentMiddlewareFromHTTPServer,
	x402HTTPResourceServer,
	x402ResourceServer,
} from "@x402/hono";
import { Hono } from "hono";
import { Pool } from "pg";

const NETWORK = "eip155:84532";
const PRICE = "$0.001";
const FACILITATOR_URL = "https://x402.org/facilitator";
const PAID_PATH = "/premium";

const payTo = process.env.X402_EVM_ADDRESS;

if (!payTo || !/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
	throw new Error(
		"Set X402_EVM_ADDRESS to a 0x-prefixed EVM address on Base Sepolia.",
	);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

let schema: Promise<void> | undefined;

// Create the payment ledger table and its idempotency index if they do not exist.
function ensureSchema(): Promise<void> {
	schema ??= (async () => {
		await pool.query(
			`CREATE TABLE IF NOT EXISTS x402_payments (
				id bigserial PRIMARY KEY,
				transaction text NOT NULL,
				network text NOT NULL,
				payer text,
				amount_atomic text NOT NULL,
				amount_usd numeric(20, 6) NOT NULL,
				asset text NOT NULL,
				resource text NOT NULL,
				created_at timestamptz NOT NULL DEFAULT now()
			)`,
		);
		await pool.query(
			`CREATE UNIQUE INDEX IF NOT EXISTS x402_payments_transaction_key
			   ON x402_payments (transaction)`,
		);
	})()
		.then(() => undefined)
		.catch((error) => {
			schema = undefined;
			throw error;
		});
	return schema;
}

const USDC_DECIMALS = 6;
const USDC_SCALE = 10n ** BigInt(USDC_DECIMALS);

// Convert an atomic USDC amount (for example "1000") to a dollar string.
function atomicToUsd(amount: string): string {
	const atomic = BigInt(amount);
	const whole = atomic / USDC_SCALE;
	const fraction = (atomic % USDC_SCALE)
		.toString()
		.padStart(USDC_DECIMALS, "0");
	return `${whole}.${fraction}`;
}

type Payment = {
	transaction: string;
	network: string;
	payer: string | null;
	amountAtomic: string;
	asset: string;
	resource: string;
};

async function recordPayment(payment: Payment): Promise<void> {
	await ensureSchema();
	await pool.query(
		`INSERT INTO x402_payments
		   (transaction, network, payer, amount_atomic, amount_usd, asset, resource)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (transaction) DO NOTHING`,
		[
			payment.transaction,
			payment.network,
			payment.payer,
			payment.amountAtomic,
			atomicToUsd(payment.amountAtomic),
			payment.asset,
			payment.resource,
		],
	);
}

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });

const resourceServer = new x402ResourceServer(facilitator)
	.register(NETWORK, new ExactEvmScheme())
	.onAfterSettle(async ({ result, requirements, paymentPayload }) => {
		await recordPayment({
			transaction: result.transaction,
			network: result.network,
			payer: result.payer ?? null,
			amountAtomic: result.amount ?? requirements.amount,
			asset: requirements.asset,
			resource: paymentPayload.resource?.url ?? PAID_PATH,
		});
	});

const routes: RoutesConfig = {
	[`GET ${PAID_PATH}`]: {
		accepts: [
			{
				scheme: "exact",
				price: PRICE,
				network: NETWORK,
				payTo,
			},
		],
		description: "Premium JSON response",
		mimeType: "application/json",
	},
};

const httpServer = new x402HTTPResourceServer(resourceServer, routes);

let x402Ready: Promise<void> | undefined;

// Fetch the facilitator's supported schemes before the first paid request.
function ensureX402(): Promise<void> {
	x402Ready ??= httpServer.initialize().catch((error) => {
		x402Ready = undefined;
		throw error;
	});
	return x402Ready;
}

const app = new Hono();

app.use("*", async (c, next) => {
	if (c.req.path === PAID_PATH) {
		try {
			await ensureX402();
		} catch (error) {
			console.error("[x402-paid-api] could not initialize x402:", error);
			return c.json({ error: "Payment facilitator unavailable" }, 503);
		}
	}
	await next();
});

app.use(
	paymentMiddlewareFromHTTPServer(httpServer, undefined, undefined, false),
);

app.use(PAID_PATH, async (c, next) => {
	if (c.req.method !== "GET") {
		return c.json({ error: "Method not allowed" }, 405, { allow: "GET" });
	}
	await next();
});

app.get("/", (c) =>
	c.json({
		name: "Paid API with x402 and Hono",
		network: NETWORK,
		price: PRICE,
		routes: {
			"GET /": "This help.",
			[`GET ${PAID_PATH}`]: `Paid with x402. Costs ${PRICE} in testnet USDC.`,
			"GET /stats": "Payment totals.",
		},
		payments: {
			testnet: true,
			facilitator: FACILITATOR_URL,
			buyerQuickstart:
				"https://docs.x402.org/getting-started/quickstart-for-buyers",
			note: "The buyer needs Base Sepolia USDC. GET /stats needs DATABASE_URL.",
		},
	}),
);

app.get(PAID_PATH, (c) =>
	c.json({
		message: "This response was paid for with x402.",
		servedAt: new Date().toISOString(),
	}),
);

app.get("/stats", async (c) => {
	try {
		await ensureSchema();
		const { rows } = await pool.query<{
			count: number;
			total_usd: string;
			last_settlement_at: Date | null;
		}>(
			`SELECT COUNT(*)::int AS count,
			        COALESCE(SUM(amount_usd), 0)::text AS total_usd,
			        MAX(created_at) AS last_settlement_at
			   FROM x402_payments`,
		);
		const stats = rows[0]!;
		return c.json({
			count: stats.count,
			totalUsd: stats.total_usd,
			lastSettlementAt: stats.last_settlement_at?.toISOString() ?? null,
		});
	} catch (error) {
		console.error("[x402-paid-api] stats failed:", error);
		return c.json({ error: "Payment ledger unavailable" }, 503);
	}
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
