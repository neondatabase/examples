import { attachDatabasePool } from "@neon/functions";
import { Pool } from "pg";

const LIMIT = 10;
const WINDOW_SECONDS = 60;
const MAX_KEY_LENGTH = 200;
const MAX_BODY_BYTES = 4_096;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

let schema: Promise<void> | undefined;

function ensureSchema(): Promise<void> {
	schema ??= pool
		.query(
			`CREATE TABLE IF NOT EXISTS rate_limit_counters (
				key text PRIMARY KEY,
				window_start timestamptz NOT NULL,
				count integer NOT NULL
			)`,
		)
		.then(() => undefined)
		.catch((error) => {
			schema = undefined;
			throw error;
		});
	return schema;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonError(message: string, status: number): Response {
	return Response.json({ error: message }, { status });
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
	const length = Number(request.headers.get("content-length") ?? "0");
	if (Number.isFinite(length) && length > MAX_BODY_BYTES) return null;

	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) return null;

	try {
		const body: unknown = JSON.parse(text);
		return isRecord(body) ? body : null;
	} catch {
		return null;
	}
}

function parseKey(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const key = value.trim();
	if (key.length === 0 || key.length > MAX_KEY_LENGTH) return null;
	if (/[\u0000-\u001f\u007f]/.test(key)) return null;
	return key;
}

// Returns the start of the current window, rounded down to the nearest window boundary.
function currentWindowStart(now = Date.now()): Date {
	return new Date(
		Math.floor(now / 1000 / WINDOW_SECONDS) * WINDOW_SECONDS * 1000,
	);
}

function rateLimitHeaders(count: number, resetAt: Date): Record<string, string> {
	return {
		"x-ratelimit-limit": String(LIMIT),
		"x-ratelimit-remaining": String(Math.max(0, LIMIT - count)),
		"x-ratelimit-reset": String(Math.floor(resetAt.getTime() / 1000)),
	};
}

async function check(key: string) {
	const windowStart = currentWindowStart();

	const { rows } = await pool.query<{ count: number; window_start: Date }>(
		`INSERT INTO rate_limit_counters (key, window_start, count)
		 VALUES ($1, $2, 1)
		 ON CONFLICT (key) DO UPDATE SET
		   count = CASE
		     WHEN rate_limit_counters.window_start = EXCLUDED.window_start
		     THEN rate_limit_counters.count + 1
		     ELSE 1
		   END,
		   window_start = EXCLUDED.window_start
		 RETURNING count, window_start`,
		[key, windowStart],
	);

	const count = rows[0]!.count;
	const resetAt = new Date(
		rows[0]!.window_start.getTime() + WINDOW_SECONDS * 1000,
	);

	return { count, resetAt };
}

async function usage(key: string) {
	const windowStart = currentWindowStart();

	const { rows } = await pool.query<{ count: number; window_start: Date }>(
		`SELECT count, window_start FROM rate_limit_counters WHERE key = $1`,
		[key],
	);

	const row = rows[0];
	const count =
		row && row.window_start.getTime() === windowStart.getTime() ? row.count : 0;

	return {
		count,
		resetAt: new Date(windowStart.getTime() + WINDOW_SECONDS * 1000),
	};
}

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		try {
			await ensureSchema();

			if (url.pathname === "/") {
				return Response.json({
					name: "Rate limit with Postgres",
					limit: LIMIT,
					windowSeconds: WINDOW_SECONDS,
					routes: [
						"POST /check { key }",
						"GET /usage?key=...",
					],
				});
			}

			if (url.pathname === "/check") {
				if (request.method !== "POST") {
					return jsonError("Use POST", 405);
				}

				const body = await readJson(request);
				if (!body) {
					return jsonError("Send a JSON body with key", 400);
				}

				const key = parseKey(body.key);
				if (!key) {
					return jsonError(`key must be 1-${MAX_KEY_LENGTH} characters`, 400);
				}

				const { count, resetAt } = await check(key);
				const allowed = count <= LIMIT;
				const headers = rateLimitHeaders(count, resetAt);

				if (!allowed) {
					headers["retry-after"] = String(
						Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
					);
				}

				return Response.json(
					{
						key,
						allowed,
						limit: LIMIT,
						remaining: Math.max(0, LIMIT - count),
						resetAt: resetAt.toISOString(),
					},
					{ status: allowed ? 200 : 429, headers },
				);
			}

			if (url.pathname === "/usage") {
				if (request.method !== "GET") {
					return jsonError("Use GET", 405);
				}

				const key = parseKey(url.searchParams.get("key"));
				if (!key) {
					return jsonError(`key must be 1-${MAX_KEY_LENGTH} characters`, 400);
				}

				const { count, resetAt } = await usage(key);
				return Response.json(
					{
						key,
						limit: LIMIT,
						used: count,
						remaining: Math.max(0, LIMIT - count),
						resetAt: resetAt.toISOString(),
					},
					{ headers: rateLimitHeaders(count, resetAt) },
				);
			}

			return jsonError("Not found", 404);
		} catch (error) {
			console.error("[rate-limit-postgres] failed:", error);
			return jsonError("Rate limit store unavailable", 503);
		}
	},
};
