import { attachDatabasePool, upgradeWebSocket } from "@neon/functions";
import { Pool } from "pg";

const OPTIONS = ["ws", "sse", "http"] as const;

const VOTER_ID = /^[A-Za-z0-9_-]{8,64}$/;

type Results = {
	type: "results";
	counts: Record<string, number>;
	total: number;
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

let ready: Promise<void> | undefined;

function ensureSchema(): Promise<void> {
	ready ??= (async () => {
		await pool.query(`
			CREATE TABLE IF NOT EXISTS votes (
				voter_id text PRIMARY KEY,
				option_id text NOT NULL,
				created_at timestamptz NOT NULL DEFAULT now()
			)
		`);
	})().catch((error) => {
		ready = undefined;
		throw error;
	});
	return ready;
}

async function readResults(): Promise<Results> {
	const counts: Record<string, number> = {};
	for (const id of OPTIONS) counts[id] = 0;

	const { rows } = await pool.query<{ option_id: string; count: number }>(
		`SELECT option_id, count(*)::int AS count FROM votes GROUP BY option_id`,
	);

	let total = 0;
	for (const row of rows) {
		if (!(row.option_id in counts)) continue;
		counts[row.option_id] = row.count;
		total += row.count;
	}

	return { type: "results", counts, total };
}

const clients = new Set<WebSocket>();
let lastPayload = "";

function drop(socket: WebSocket) {
	clients.delete(socket);
	stopPolling();
}

function send(socket: WebSocket, payload: string) {
	if (socket.readyState !== socket.OPEN) {
		drop(socket);
		return;
	}
	try {
		socket.send(payload);
	} catch {
		// The socket closed between the readyState check and the send.
		drop(socket);
	}
}

let polling = false;
async function pushResults() {
	if (polling || clients.size === 0) return;
	polling = true;
	try {
		const payload = JSON.stringify(await readResults());
		if (payload === lastPayload) return;
		lastPayload = payload;
		for (const socket of clients) send(socket, payload);
	} finally {
		polling = false;
	}
}

// The pollers only run while someone is connected, so an idle isolate can scale
// to zero. The first client starts them; the last one to leave stops them.
let poller: ReturnType<typeof setInterval> | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;

function startPolling() {
	if (poller) return;

	poller = setInterval(() => {
		pushResults().catch((error) => console.error("[poll] failed:", error));
	}, 1000);

	// Proxies drop idle sockets well before Neon's 15-minute idle timeout.
	heartbeat = setInterval(() => {
		const payload = JSON.stringify({ type: "ping" });
		for (const socket of clients) send(socket, payload);
	}, 25_000);
}

function stopPolling() {
	if (clients.size > 0) return;
	clearInterval(poller);
	clearInterval(heartbeat);
	poller = undefined;
	heartbeat = undefined;
}

async function handleVote(request: Request): Promise<Response> {
	let body: Record<string, unknown>;
	try {
		const parsed: unknown = await request.json();
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			throw new Error("not an object");
		}
		body = parsed as Record<string, unknown>;
	} catch {
		return Response.json({ error: "Expected a JSON object body" }, { status: 400 });
	}

	const { optionId, voterId } = body;
	if (
		typeof optionId !== "string" ||
		!OPTIONS.includes(optionId as (typeof OPTIONS)[number])
	) {
		return Response.json(
			{ error: `optionId must be one of: ${OPTIONS.join(", ")}` },
			{ status: 400 },
		);
	}
	if (typeof voterId !== "string" || !VOTER_ID.test(voterId)) {
		return Response.json(
			{ error: "voterId must be 8-64 letters, digits, hyphens, or underscores" },
			{ status: 400 },
		);
	}

	await ensureSchema();

	await pool.query(
		`INSERT INTO votes (voter_id, option_id) VALUES ($1, $2)
		 ON CONFLICT (voter_id)
		 DO UPDATE SET option_id = EXCLUDED.option_id, created_at = now()`,
		[voterId, optionId],
	);

	return Response.json(await readResults());
}

async function openSocket(request: Request): Promise<Response> {
	if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
		return new Response(
			"This endpoint speaks WebSocket. Connect with a WebSocket client.",
			{ status: 426, headers: { upgrade: "websocket" } },
		);
	}

	await ensureSchema();

	// Return `response` unchanged. The runtime carries the pending upgrade on
	// it; cloning or rebuilding the response discards the upgrade.
	const { socket, response } = upgradeWebSocket(request);

	socket.addEventListener("open", () => {
		clients.add(socket);
		startPolling();

		// Send the current snapshot right away, so a client that missed the
		// `/results` fetch still renders without waiting for the next change.
		readResults()
			.then((results) => {
				lastPayload = JSON.stringify(results);
				send(socket, lastPayload);
			})
			.catch((error) => console.error("[open] failed:", error));
	});
	socket.addEventListener("close", () => drop(socket));
	socket.addEventListener("error", () => drop(socket));

	return response;
}

const HINT = `Live poll API.

  GET  /results   Current counts as JSON.
  POST /vote      { "optionId": "ws", "voterId": "<random id>" }
  GET  /ws        WebSocket upgrade. Pushes { "type": "results" } frames
                  and a { "type": "ping" } keepalive.

Test the socket with:
  npx wscat -c wss://<function-url>/ws
`;

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		try {
			if (request.method === "GET" && url.pathname === "/") {
				return new Response(HINT.replace("<function-url>", new URL(request.url).host), {
					headers: { "content-type": "text/plain; charset=utf-8" },
				});
			}

			if (request.method === "GET" && url.pathname === "/results") {
				await ensureSchema();
				return Response.json(await readResults(), {
					headers: { "cache-control": "no-store" },
				});
			}

			if (request.method === "POST" && url.pathname === "/vote") {
				return await handleVote(request);
			}

			if (request.method === "GET" && url.pathname === "/ws") {
				return await openSocket(request);
			}

			return new Response("Not found", { status: 404 });
		} catch (error) {
			console.error("[request] failed:", error);
			return Response.json({ error: "Internal error" }, { status: 500 });
		}
	},
};
