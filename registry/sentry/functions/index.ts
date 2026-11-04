import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/node";
import { Hono } from "hono";

// One init per process: this template deliberately ships one module, because a
// router with several operation modules would initialize Sentry more than once.
Sentry.init({
	dsn: process.env.SENTRY_DSN,
	enabled: Boolean(process.env.SENTRY_DSN),
	tracesSampleRate: 1,
	// Neon invokes the handler through its own ingress, not a node:http server,
	// so the request root span is created by the middleware below.
	integrations: [
		Sentry.httpIntegration({ disableIncomingRequestSpans: true }),
	],
	// NEON_BRANCH is injected by the runtime; do not declare it in template.json.
	environment:
		!process.env.NEON_BRANCH || process.env.NEON_BRANCH === "main"
			? "production"
			: process.env.NEON_BRANCH,
});

type OrderItem = { sku: string; qty: number };

const app = new Hono();

app.use("*", (c, next) =>
	Sentry.withIsolationScope(() =>
		Sentry.startSpan(
			{
				op: "http.server",
				name: `${c.req.method} ${c.req.path}`,
				forceTransaction: true,
				attributes: {
					"http.request.method": c.req.method,
					"url.path": c.req.path,
				},
			},
			async (span) => {
				await next();
				span.setAttribute("http.response.status_code", c.res.status);
			},
		).finally(() => Sentry.flush(2000)),
	),
);

app.get("/", (c) =>
	c.json({
		name: "Sentry-instrumented API",
		routes: [
			"GET /health",
			"GET /api/orders/:id",
			"POST /api/orders",
			"GET /debug-sentry",
		],
	}),
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/api/orders/:id", (c) =>
	c.json({ orderId: c.req.param("id"), status: "confirmed" }),
);

app.post("/api/orders", async (c) => {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Expected a JSON body" }, 400);
	}

	const input =
		body && typeof body === "object" && !Array.isArray(body)
			? (body as Record<string, unknown>)
			: {};
	const items = input.items;
	if (!Array.isArray(items) || items.length === 0) {
		return c.json({ error: "orders require a non-empty items array" }, 400);
	}
	const isValidItem = (item: unknown): item is OrderItem =>
		Boolean(item) &&
		typeof item === "object" &&
		typeof (item as Record<string, unknown>).sku === "string" &&
		typeof (item as Record<string, unknown>).qty === "number" &&
		Number.isInteger((item as Record<string, unknown>).qty) &&
		((item as Record<string, unknown>).qty as number) > 0;
	if (!items.every(isValidItem)) {
		return c.json({ error: "each item needs a sku and a positive integer qty" }, 400);
	}

	const orderId = randomUUID();
	const forceFailure = input.force_failure === true;

	Sentry.logger.info("order received", {
		component: "api",
		orderId,
		items: items.length,
	});

	try {
		const provider = await Sentry.startSpan(
			{ name: "order.charge", attributes: { orderId } },
			() => chargeOrder(orderId, forceFailure),
		);
		Sentry.logger.info("order charged", {
			component: "api",
			orderId,
			provider,
		});
		return c.json({ orderId, status: "confirmed", provider });
	} catch (error) {
		// Terminal: every provider failed, so this one becomes an issue.
		Sentry.captureException(error, {
			tags: { component: "api", phase: "charge" },
			contexts: { order: { orderId, items: items.length } },
		});
		return c.json({ error: "charge_failed" }, 502);
	}
});

// Fake providers keep the template runnable without a payment account. The
// first provider fails on demand so you can see a recovered failure logged
// without becoming an issue.
function chargeOrder(orderId: string, forceFailure: boolean) {
	const providers = ["stripe", "polar"];
	let lastError: unknown;

	for (const provider of providers) {
		try {
			callProvider(provider, orderId, forceFailure);
			return provider;
		} catch (error) {
			lastError = error;
			Sentry.logger.warn("payment provider failed, trying the next one", {
				component: "api",
				phase: "charge-attempt",
				provider,
				error: String(error),
			});
		}
	}

	throw lastError ?? new Error("all payment providers failed");
}

function callProvider(name: string, orderId: string, forceFailure: boolean) {
	if (forceFailure && name === "stripe") {
		throw new Error(`provider ${name} declined the charge for ${orderId}`);
	}
	return { transactionId: randomUUID() };
}

app.get("/debug-sentry", () => {
	throw new Error("sentry test: unhandled route error");
});

app.onError((error, c) => {
	Sentry.captureException(error);
	return c.json({ error: "internal_error" }, 500);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

// A Hono app satisfies the Neon Function contract: it exposes fetch(request).
export default app;
