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
	const { title, completed = false } = await c.req.json();
	const { rows } = await pool.query<Todo>(
		`INSERT INTO todos (title, completed)
		 VALUES ($1, $2)
		 RETURNING ${TODO_COLUMNS}`,
		[title, completed],
	);
	return c.json(rows[0], 201);
});

app.get("/todos/:id", async (c) => {
	const { rows } = await pool.query<Todo>(
		`SELECT ${TODO_COLUMNS} FROM todos WHERE id = $1`,
		[c.req.param("id")],
	);
	return rows[0] ? c.json(rows[0]) : c.json({ error: "Not found" }, 404);
});

app.patch("/todos/:id", async (c) => {
	const { title, completed } = await c.req.json();
	const { rows } = await pool.query<Todo>(
		`UPDATE todos
		 SET title = COALESCE($1, title), completed = COALESCE($2, completed)
		 WHERE id = $3
		 RETURNING ${TODO_COLUMNS}`,
		[title ?? null, completed ?? null, c.req.param("id")],
	);
	return rows[0] ? c.json(rows[0]) : c.json({ error: "Not found" }, 404);
});

app.delete("/todos/:id", async (c) => {
	const { rowCount } = await pool.query("DELETE FROM todos WHERE id = $1", [
		c.req.param("id"),
	]);
	return rowCount ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
});

export default app;
