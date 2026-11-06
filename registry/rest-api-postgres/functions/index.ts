import { attachDatabasePool } from "@neon/functions";
import { Hono } from "hono";
import type { Context, Next } from "hono";
import { Pool } from "pg";

const LIST_LIMIT = 100;

const TODO_COLUMNS = "id, title, completed, created_at";

type Todo = {
	id: number;
	title: string;
	completed: boolean;
	created_at: Date;
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

let schema: Promise<void> | undefined;

// Create the table if it does not exist.
function ensureSchema(): Promise<void> {
	schema ??= pool
		.query(
			`CREATE TABLE IF NOT EXISTS todos (
				id serial PRIMARY KEY,
				title text NOT NULL,
				completed boolean NOT NULL DEFAULT false,
				created_at timestamptz NOT NULL DEFAULT now()
			)`,
		)
		.then(() => undefined);
	return schema;
}

const MAX_ID = 2_147_483_647;

// Parse a route id as a positive serial value, or return null.
function parseId(c: Context): number | null {
	const raw = c.req.param("id") ?? "";
	if (!/^\d+$/.test(raw)) return null;
	const id = Number(raw);
	return id >= 1 && id <= MAX_ID ? id : null;
}

// Read a JSON object body, or return null when it is missing or malformed.
async function readBody(c: Context): Promise<Record<string, unknown> | null> {
	try {
		const body = await c.req.json();
		return typeof body === "object" && body !== null && !Array.isArray(body)
			? body
			: null;
	} catch {
		return null;
	}
}

const isTitle = (value: unknown): value is string =>
	typeof value === "string" && value.trim().length > 0;

const app = new Hono();

const ready = async (_c: Context, next: Next) => {
	await ensureSchema();
	await next();
};

app.use("/todos", ready);
app.use("/todos/*", ready);

app.get("/", (c) =>
	c.json({
		name: "REST API with Hono and Postgres",
		routes: [
			"GET /todos",
			"POST /todos",
			"GET /todos/:id",
			"PATCH /todos/:id",
			"DELETE /todos/:id",
		],
	}),
);

app.get("/todos", async (c) => {
	const { rows } = await pool.query<Todo>(
		`SELECT ${TODO_COLUMNS}
		 FROM todos
		 ORDER BY created_at DESC, id DESC
		 LIMIT $1`,
		[LIST_LIMIT],
	);
	return c.json(rows);
});

app.post("/todos", async (c) => {
	const body = await readBody(c);
	if (!body) return c.json({ error: "Expected a JSON object body" }, 400);
	const { title, completed = false } = body;
	if (!isTitle(title)) {
		return c.json({ error: "title must be a non-empty string" }, 400);
	}
	if (typeof completed !== "boolean") {
		return c.json({ error: "completed must be a boolean" }, 400);
	}
	const { rows } = await pool.query<Todo>(
		`INSERT INTO todos (title, completed)
		 VALUES ($1, $2)
		 RETURNING ${TODO_COLUMNS}`,
		[title.trim(), completed],
	);
	return c.json(rows[0], 201);
});

app.get("/todos/:id", async (c) => {
	const id = parseId(c);
	if (id === null) return c.json({ error: "id must be a positive integer" }, 400);
	const { rows } = await pool.query<Todo>(
		`SELECT ${TODO_COLUMNS} FROM todos WHERE id = $1`,
		[id],
	);
	return rows[0] ? c.json(rows[0]) : c.json({ error: "Not found" }, 404);
});

app.patch("/todos/:id", async (c) => {
	const id = parseId(c);
	if (id === null) return c.json({ error: "id must be a positive integer" }, 400);
	const body = await readBody(c);
	if (!body) return c.json({ error: "Expected a JSON object body" }, 400);
	const { title, completed } = body;
	if (title !== undefined && !isTitle(title)) {
		return c.json({ error: "title must be a non-empty string" }, 400);
	}
	if (completed !== undefined && typeof completed !== "boolean") {
		return c.json({ error: "completed must be a boolean" }, 400);
	}
	const { rows } = await pool.query<Todo>(
		`UPDATE todos
		 SET title = COALESCE($1, title), completed = COALESCE($2, completed)
		 WHERE id = $3
		 RETURNING ${TODO_COLUMNS}`,
		[typeof title === "string" ? title.trim() : null, completed ?? null, id],
	);
	return rows[0] ? c.json(rows[0]) : c.json({ error: "Not found" }, 404);
});

app.delete("/todos/:id", async (c) => {
	const id = parseId(c);
	if (id === null) return c.json({ error: "id must be a positive integer" }, 400);
	const { rowCount } = await pool.query("DELETE FROM todos WHERE id = $1", [id]);
	return rowCount ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
});

export default app;
