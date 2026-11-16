import { attachDatabasePool } from "@neon/functions";
import { parseTriggerDelivery } from "@neon/functions/triggers";
import { Pool } from "pg";

// Every check runs in a read-only transaction with this timeout.
const STATEMENT_TIMEOUT = "15s";

const SLACK_TIMEOUT_MS = 10_000;

type Operator = ">" | ">=" | "<" | "<=";

type Check = {
	id: string;
	title: string;
	sql: string;
	operator: Operator;
	threshold: number;
};

// Edit this list. Each query must return exactly one row with one numeric column.
const CHECKS: Check[] = [
	{
		id: "long-running-queries",
		title: "Long-running queries",
		sql: `select count(*)::int
		      from pg_stat_activity
		      where state = 'active'
		        and pid <> pg_backend_pid()
		        and now() - query_start > interval '5 minutes'`,
		operator: ">",
		threshold: 0,
	},
	{
		id: "idle-in-transaction",
		title: "Idle transactions",
		// An idle-in-transaction session holds its locks and blocks vacuum,
		// so alert on it.
		sql: `select count(*)::int
		      from pg_stat_activity
		      where state = 'idle in transaction'
		        and pid <> pg_backend_pid()
		        and now() - state_change > interval '2 minutes'`,
		operator: ">",
		threshold: 0,
	},
	// For example, to alert on failed payments in the last hour
	// {
	// 	id: "failed-payments",
	// 	title: "Failed payments in the last hour",
	// 	sql: "select count(*)::int from payments where status = 'failed' and created_at > now() - interval '1 hour'",
	// 	operator: ">",
	// 	threshold: 5,
	// },
];

type CheckResult = { check: Check; value: number; firing: boolean };

type Outcome =
	| { id: string; ok: true; value: number; firing: boolean }
	| { id: string; ok: false; error: string };

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

function jsonError(message: string, status: number): Response {
	return Response.json({ error: message }, { status });
}

function compare(value: number, operator: Operator, threshold: number): boolean {
	switch (operator) {
		case ">":
			return value > threshold;
		case ">=":
			return value >= threshold;
		case "<":
			return value < threshold;
		case "<=":
			return value <= threshold;
	}
}

async function evaluate(check: Check): Promise<CheckResult> {
	const client = await pool.connect();
	let committed = false;
	try {
		await client.query("begin read only");
		await client.query(`set local statement_timeout = '${STATEMENT_TIMEOUT}'`);
		const { rows, fields } = await client.query(check.sql);
		await client.query("commit");
		committed = true;

		if (fields.length !== 1) {
			throw new Error(`must select exactly one column, got ${fields.length}`);
		}
		if (rows.length !== 1) {
			throw new Error(`must return exactly one row, got ${rows.length}`);
		}

		const raw = rows[0]![fields[0]!.name];
		if (raw === null || raw === undefined) {
			throw new Error("must not return NULL");
		}

		const value = Number(raw);
		if (!Number.isFinite(value)) {
			throw new Error(`must return a number, got ${String(raw)}`);
		}

		return { check, value, firing: compare(value, check.operator, check.threshold) };
	} catch (error) {
		if (!committed) await client.query("rollback").catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

function alertText(result: CheckResult): string {
	const { check, value } = result;
	const branch = process.env.NEON_BRANCH;

	return `${branch ? `[${branch}] ` : ""}ALERT: ${check.title} is ${value} (threshold ${check.operator} ${check.threshold})`;
}

async function sendAlert(result: CheckResult): Promise<void> {
	const url = process.env.SLACK_WEBHOOK_URL!;

	const response = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ text: alertText(result) }),
		signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
	});

	if (response.ok) return;

	const detail = (await response.text().catch(() => "")).slice(0, 200);
	throw new Error(`Slack returned ${response.status}${detail ? `: ${detail}` : ""}`);
}

async function runChecks(): Promise<Outcome[]> {
	const outcomes: Outcome[] = [];

	for (const check of CHECKS) {
		try {
			const result = await evaluate(check);
			if (result.firing) await sendAlert(result);
			outcomes.push({ id: check.id, ok: true, value: result.value, firing: result.firing });
		} catch (error) {
			console.error(`[sql-alerts] ${check.id} failed:`, error);
			outcomes.push({
				id: check.id,
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return outcomes;
}

function summarize(outcomes: Outcome[]): Response {
	const failed = outcomes.filter((outcome) => !outcome.ok);

	return Response.json(
		{
			ok: failed.length === 0,
			checked: outcomes.length,
			notified: outcomes.filter((outcome) => outcome.ok && outcome.firing).length,
			results: outcomes,
		},
		{ status: failed.length === 0 ? 200 : 502 },
	);
}

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		try {
			if (url.pathname === "/") {
				if (request.method !== "GET") return jsonError("Use GET", 405);

				return Response.json({
					name: "Alert on SQL thresholds",
					routes: ["POST /run      evaluate every check and notify (schedule trigger only)"],
					checks: CHECKS.map(({ id, title, operator, threshold }) => ({
						id,
						title,
						operator,
						threshold,
					})),
				});
			}

			if (url.pathname === "/run") {
				if (request.method !== "POST") return jsonError("Use POST", 405);

				const delivery = await parseTriggerDelivery(request);
				if (!delivery.ok) {
					const status = delivery.error === "invalid_body" ? 400 : 401;
					return jsonError(delivery.error, status);
				}

				return summarize(await runChecks());
			}

			return jsonError("Not found", 404);
		} catch (error) {
			console.error("[sql-alerts] failed:", error);
			return jsonError("Alert checks are unavailable", 503);
		}
	},
};
