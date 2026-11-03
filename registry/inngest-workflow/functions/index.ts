import { attachDatabasePool } from "@neon/functions";
import { Hono } from "hono";
import { Inngest } from "inngest";
import { serve } from "inngest/hono";
import { Pool } from "pg";

const JOB_EVENT = "app/job.created";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

let schema: Promise<void> | undefined;

// Create the table on first use
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

const inngest = new Inngest({ id: "neon-durable-workflow" });

const processJob = inngest.createFunction(
	{
		id: "process-job-workflow",
		retries: 3,
		triggers: [{ event: JOB_EVENT }],
	},
	async ({ event, step }) => {
		const { jobId } = event.data as { jobId: string };

		await step.run("start-job", async () => {
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

		// The timer runs in Inngest, so no compute is used while the workflow waits.
		await step.sleep("wait-before-finishing", "5s");

		await step.run("finish-job", async () => {
			await pool.query(
				`UPDATE jobs
				 SET status = 'completed', step = 'finished', finished_at = now()
				 WHERE id = $1`,
				[jobId],
			);
			return { jobId, status: "completed" };
		});

		return { success: true, jobId };
	},
);

const functions = [processJob];

const app = new Hono();

app.on(["GET", "PUT", "POST"], "/api/inngest", serve({ client: inngest, functions }));

app.post("/api/events", async (c) => {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Expected a JSON object body" }, 400);
	}
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return c.json({ error: "Expected a JSON object body" }, 400);
	}

	const { name, data } = body as { name?: unknown; data?: unknown };
	if (name !== JOB_EVENT) {
		return c.json({ error: `name must be "${JOB_EVENT}"` }, 400);
	}
	if (typeof data !== "object" || data === null || Array.isArray(data)) {
		return c.json({ error: "data must be an object" }, 400);
	}

	const { jobId } = data as Record<string, unknown>;
	if (typeof jobId !== "string" || jobId.length === 0) {
		return c.json({ error: "data.jobId must be a non-empty string" }, 400);
	}

	try {
		const result = await inngest.send({
			name: JOB_EVENT,
			data: { jobId },
		});
		return c.json({ ids: result.ids, status: 200 });
	} catch (error) {
		console.error("[events] failed:", error);
		return c.json({ error: "Could not send the event to Inngest" }, 502);
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
		name: "Durable workflow with Inngest",
		event: JOB_EVENT,
		routes: ["GET /", "POST /api/events", "GET /api/jobs/:id", "GET|PUT|POST /api/inngest"],
	}),
);

export default app;
