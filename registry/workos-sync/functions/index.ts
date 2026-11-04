import { attachDatabasePool, waitUntil } from "@neon/functions";
import { parseTriggerDelivery } from "@neon/functions/triggers";
import { timingSafeEqual } from "node:crypto";
import { Pool } from "pg";
import {
	fromPgPool,
	LeaseHeldError,
	PostgresDestination,
	SyncEngine,
	verifyWebhook,
	WebhookVerificationError,
} from "@workos/sync-postgres";

// The `_env` value every mirrored row carries. Rename it to match the WorkOS
// environment, or add entries to `environments` below to mirror several.
const ENVIRONMENT = "production";

// Pages one backfill or reconcile slice fetches before it checkpoints and
// returns. A page is one WorkOS list request. Each response reports `pages`,
// so raise this until a slice uses most of the 15-minute budget but still
// finishes before the next trigger fires.
const MAX_PAGES = 50;

// Events one tick applies before it returns. The cursor carries the rest to
// the next tick.
const MAX_EVENTS_PER_TICK = 2000;

const ROUTES = {
	"POST /tick": "Poll the Events API once. Schedule trigger, every minute.",
	"POST /backfill":
		"Load one slice of existing data; a no-op once every stream is complete. Schedule trigger, every 5 minutes.",
	"POST /reconcile":
		"Continue the reconcile pass in progress and repair drift; a no-op once complete. Schedule trigger, hourly.",
	"POST /reconcile/fresh": "Start a new reconcile pass. Schedule trigger, weekly.",
	"POST /webhook": "WorkOS webhook endpoint. A verified delivery polls now.",
	"GET /status": "Per-stream counts, poll age, and lag. Send `Authorization: Bearer <WORKOS_SYNC_STATUS_TOKEN>`.",
};

// Module scope, so a warm isolate reuses the pool and the engine's state.
// Nothing connects here: pg connects on first query, and the engine makes no
// request until a route calls it.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
attachDatabasePool(pool);

let engine: SyncEngine | undefined;

function getEngine(): SyncEngine {
	engine ??= new SyncEngine({
		destination: new PostgresDestination({ db: fromPgPool(pool) }),
		environments: [{ name: ENVIRONMENT, apiKey: process.env.WORKOS_API_KEY! }],
		maxEventsPerTick: MAX_EVENTS_PER_TICK,
	});
	return engine;
}

// Neon POSTs trigger deliveries without a bearer token. The invocation id in
// the body must match a header the proxy strips from outside callers.
async function rejectUnlessTrigger(request: Request): Promise<Response | null> {
	const parsed = await parseTriggerDelivery(request);
	if (parsed.ok) return null;
	return new Response(parsed.error, { status: parsed.error === "invalid_body" ? 400 : 401 });
}

// Function URLs are public, so the one route meant for people needs a token.
// Compared in constant time.
function bearerMatches(request: Request, token: string): boolean {
	const header = request.headers.get("authorization") ?? "";
	const presented = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
	const expected = Buffer.from(token);
	return presented.length === expected.length && timingSafeEqual(presented, expected);
}

// A held lease means another invocation is already polling, and the events
// stream carries the change either way, so there is nothing to retry.
function skippedIfLeaseHeld(err: unknown): Response {
	if (err instanceof LeaseHeldError) {
		return Response.json({ skipped: "another invocation is polling", holder: err.holder });
	}
	throw err;
}

async function handle(request: Request): Promise<Response> {
	const { pathname } = new URL(request.url);
	const route = `${request.method} ${pathname}`;

	if (route === "GET /") {
		return Response.json({ routes: ROUTES });
	}

	if (route === "GET /status") {
		if (!bearerMatches(request, process.env.WORKOS_SYNC_STATUS_TOKEN!)) {
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		}
		return Response.json(await getEngine().status());
	}

	if (route === "POST /tick") {
		const rejected = await rejectUnlessTrigger(request);
		if (rejected) return rejected;
		try {
			return Response.json(await getEngine().tick());
		} catch (err) {
			return skippedIfLeaseHeld(err);
		}
	}

	if (route === "POST /backfill") {
		const rejected = await rejectUnlessTrigger(request);
		if (rejected) return rejected;
		return Response.json(await getEngine().backfill({ resume: true, maxPages: MAX_PAGES }));
	}

	if (route === "POST /reconcile" || route === "POST /reconcile/fresh") {
		const rejected = await rejectUnlessTrigger(request);
		if (rejected) return rejected;
		const resume = pathname === "/reconcile";
		return Response.json(await getEngine().reconcile({ repair: true, resume, maxPages: MAX_PAGES }));
	}

	if (route === "POST /webhook") {
		const signature = request.headers.get("workos-signature");
		if (!signature) {
			return Response.json({ error: "Missing WorkOS-Signature header" }, { status: 401 });
		}
		// Verify the raw bytes, before any parsing.
		const payload = await request.text();
		try {
			verifyWebhook({ payload, signature, secret: process.env.WORKOS_WEBHOOK_SECRET! });
		} catch (err) {
			if (err instanceof WebhookVerificationError) {
				return Response.json({ error: "Invalid signature" }, { status: 401 });
			}
			throw err;
		}
		// Acknowledge now, since WorkOS retries deliveries that do not answer
		// promptly, and poll after the response within the invocation's budget.
		// The delivery is a nudge, not the source of truth: the change arrives
		// through the events stream whether or not this poll runs.
		waitUntil(
			getEngine()
				.processWebhook()
				.catch((err) => {
					if (!(err instanceof LeaseHeldError)) console.error("webhook poll failed", err);
				}),
		);
		return Response.json({ ok: true });
	}

	return Response.json({ error: "Not found", routes: ROUTES }, { status: 404 });
}

export default {
	async fetch(request: Request): Promise<Response> {
		for (const name of ["DATABASE_URL", "WORKOS_API_KEY", "WORKOS_WEBHOOK_SECRET", "WORKOS_SYNC_STATUS_TOKEN"]) {
			if (!process.env[name]) {
				return Response.json({ error: `Missing configuration: ${name}` }, { status: 503 });
			}
		}
		try {
			return await handle(request);
		} catch (err) {
			// Details go to `neon logs`; the body stays generic.
			console.error("request failed", err);
			return Response.json({ error: "Internal error" }, { status: 500 });
		}
	},
};
