import { attachDatabasePool } from "@neon/functions";
import { Client } from "@upstash/workflow";
import { serve } from "@upstash/workflow/hono";
import { Hono } from "hono";
import { Pool } from "pg";

type JobPayload = { jobId: string };

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

let schema: Promise<void> | undefined;

// Create the table on first use, so the template has no migration step.
function ensureSchema(): Promise<void> {
	schema ??= pool
		.query(
			`CREATE TABLE IF NOT EXISTS jobs (
				id text PRIMARY KEY,
				status text NOT NULL DEFAULT 'pending',
				step text NOT NULL DEFAULT 'created',
				created_at timestamptz NOT NULL DEFAULT now(),
				finished_at timestamptz
			)`,
		)
		.then(() => undefined)
		.catch((error) => {
			schema = undefined;
			throw error;
		});
	return schema;
}

const app = new Hono();
const workflow = new Client({});

app.post(
	"/api/workflow",
	serve<JobPayload>(async (context) => {
		const { jobId } = context.requestPayload;

		await context.run("start-job", async () => {
			await ensureSchema();
			await pool.query(
				`INSERT INTO jobs (id, status, step)
				 VALUES ($1, 'running', 'started')
				 ON CONFLICT (id) DO UPDATE
				 SET status = 'running',
				     step = 'started',
				     finished_at = NULL`,
				[jobId],
			);
			return { jobId, status: "running" };
		});

		// QStash holds the timer, so the function is not running while the workflow waits.
		await context.sleep("wait-before-finishing", "5s");

		await context.run("finish-job", async () => {
			await pool.query(
				`UPDATE jobs
				 SET status = 'completed', step = 'finished', finished_at = now()
				 WHERE id = $1`,
				[jobId],
			);
			return { jobId, status: "completed" };
		});

		return { success: true, jobId };
	}),
);

app.post("/api/jobs", async (c) => {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Expected a JSON object body" }, 400);
	}

	const jobId =
		typeof body === "object" && body !== null && "jobId" in body ? body.jobId : undefined;
	if (typeof jobId !== "string" || jobId.length === 0) {
		return c.json({ error: "jobId must be a non-empty string" }, 400);
	}

	try {
		const { workflowRunId } = await workflow.trigger({
			url: new URL("/api/workflow", c.req.url).toString(),
			body: { jobId } satisfies JobPayload,
			retries: 3,
		});
		return c.json({ workflowRunId }, 202);
	} catch (error) {
		console.error("[jobs] failed to start workflow:", error);
		return c.json({ error: "Could not start the workflow" }, 502);
	}
});

app.get("/api/jobs/:id", async (c) => {
	const id = c.req.param("id");
	await ensureSchema();

	const { rows } = await pool.query(
		`SELECT id, status, step, created_at, finished_at FROM jobs WHERE id = $1`,
		[id],
	);
	return rows[0] ? c.json(rows[0]) : c.json({ error: "Not found" }, 404);
});

app.get("/", (c) =>
	c.json({
		name: "Durable workflow with Upstash Workflow",
		routes: ["GET /", "POST /api/jobs", "GET /api/jobs/:id", "POST /api/workflow"],
	}),
);

export default app;
