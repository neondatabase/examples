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

const ENVIRONMENT = "production";

// WorkOS list requests per backfill or reconcile slice.
const MAX_PAGES = 50;

// Streams the scheduled reconcile routes leave out. A stream whose listing
// alone needs more than MAX_PAGES pages is abandoned, reported `oversized`
// in that response and in GET /status, and tried again by every fresh pass.
// Name it here, and reconcile it on its own schedule from a host without a
// time limit: `npx workos-sync-postgres reconcile --repair --streams <name>`
// against the same DATABASE_URL.
const RECONCILE_EXCLUDE: string[] = [];

// The cursor carries the remaining events to the next tick.
const MAX_EVENTS_PER_TICK = 2000;

const ROUTES = {
	"GET /": "This route index.",
	"POST /tick": "Poll the Events API once. Schedule trigger, every minute.",
	"POST /backfill":
		"Load one slice of existing data; a no-op once every stream is complete. Schedule trigger, every 5 minutes.",
	"POST /reconcile":
		"Continue the reconcile pass in progress and repair drift; a no-op once complete. Schedule trigger, hourly.",
	"POST /reconcile/fresh": "Start a new reconcile pass. Schedule trigger, weekly.",
	"POST /webhook": "WorkOS webhook endpoint. A verified delivery polls now.",
	"GET /status": "Per-stream counts, poll age, lag, and oversized streams. Send `Authorization: Bearer <WORKOS_SYNC_STATUS_TOKEN>`.",
};

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

// The invocation id in the body must match a header the proxy strips from outside callers.
async function rejectUnlessTrigger(request: Request): Promise<Response | null> {
	const parsed = await parseTriggerDelivery(request);
	if (parsed.ok) return null;
	return Response.json({ error: parsed.error }, { status: parsed.error === "invalid_body" ? 400 : 401 });
}

function bearerMatches(request: Request, token: string): boolean {
	const header = request.headers.get("authorization") ?? "";
	const presented = Buffer.from(/^bearer /i.test(header) ? header.slice(7) : "");
	const expected = Buffer.from(token);
	return presented.length === expected.length && timingSafeEqual(presented, expected);
}

async function handleWebhook(request: Request): Promise<Response> {
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
	// Ack before polling so WorkOS does not retry; the events stream is the source of truth.
	waitUntil(
		getEngine()
			.processWebhook()
			.catch((err) => {
				if (!(err instanceof LeaseHeldError)) console.error("webhook poll failed", err);
			}),
	);
	return Response.json({ ok: true });
}

async function handle(request: Request): Promise<Response> {
	const { pathname } = new URL(request.url);

	switch (`${request.method} ${pathname}`) {
		case "GET /":
			return Response.json({ routes: ROUTES });

		case "GET /status":
			if (!bearerMatches(request, process.env.WORKOS_SYNC_STATUS_TOKEN!)) {
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}
			return Response.json(await getEngine().status());

		case "POST /tick": {
			const rejected = await rejectUnlessTrigger(request);
			if (rejected) return rejected;
			try {
				return Response.json(await getEngine().tick());
			} catch (err) {
				// A held lease means another invocation is already polling, and the events
				// stream carries the change either way, so there is nothing to retry.
				if (!(err instanceof LeaseHeldError)) throw err;
				return Response.json({ skipped: "another invocation is polling", holder: err.holder });
			}
		}

		case "POST /backfill": {
			const rejected = await rejectUnlessTrigger(request);
			if (rejected) return rejected;
			return Response.json(await getEngine().backfill({ resume: true, maxPages: MAX_PAGES }));
		}

		case "POST /reconcile":
		case "POST /reconcile/fresh": {
			const rejected = await rejectUnlessTrigger(request);
			if (rejected) return rejected;
			const resume = pathname === "/reconcile";
			return Response.json(
				await getEngine().reconcile({ repair: true, resume, maxPages: MAX_PAGES, excludeStreams: RECONCILE_EXCLUDE }),
			);
		}

		case "POST /webhook":
			return handleWebhook(request);

		default:
			return Response.json({ error: "Not found", routes: ROUTES }, { status: 404 });
	}
}

export default {
	async fetch(request: Request): Promise<Response> {
		for (const name of ["DATABASE_URL", "WORKOS_API_KEY", "WORKOS_WEBHOOK_SECRET", "WORKOS_SYNC_STATUS_TOKEN"]) {
			if (!process.env[name]) {
				console.error(`missing configuration: ${name}`);
				return Response.json({ error: "Missing configuration" }, { status: 503 });
			}
		}
		try {
			return await handle(request);
		} catch (err) {
			console.error("request failed", err);
			return Response.json({ error: "Internal error" }, { status: 500 });
		}
	},
};
