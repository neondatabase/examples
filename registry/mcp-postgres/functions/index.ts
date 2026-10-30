import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { attachDatabasePool } from "@neon/functions";
import { Hono } from "hono";
import { Pool } from "pg";
import { z } from "zod";

const MAX_LIMIT = 50;

type Todo = {
	id: number;
	title: string;
	notes: string | null;
	completed: boolean;
	created_at: Date;
	updated_at: Date;
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

const apiKey = process.env.MCP_API_KEY;

let schemaReady: Promise<void> | undefined;

// Create the table if it does not exist.
const ensureSchema = (): Promise<void> => {
	schemaReady ??= pool
		.query(`
			CREATE TABLE IF NOT EXISTS mcp_todos (
				id serial PRIMARY KEY,
				title text NOT NULL,
				notes text,
				completed boolean NOT NULL DEFAULT false,
				created_at timestamptz NOT NULL DEFAULT now(),
				updated_at timestamptz NOT NULL DEFAULT now()
			)
		`)
		.then(() => undefined);
	return schemaReady;
};

const asTextResult = (payload: unknown, isError = false) => ({
	content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
	isError,
});

const optionalText = (description: string) =>
	z.string().trim().min(1).optional().describe(description);

const createServer = () => {
	const server = new McpServer({ name: "mcp-postgres", version: "1.0.0" });

	server.registerTool(
		"create_todo",
		{
			title: "Create todo",
			description: "Insert a todo and return the new row.",
			inputSchema: z.object({
				title: z.string().trim().min(1).describe("What needs to be done."),
				notes: optionalText("Free-form notes."),
			}),
		},
		async ({ title, notes }) => {
			await ensureSchema();
			const { rows } = await pool.query<Todo>(
				`INSERT INTO mcp_todos (title, notes)
				 VALUES ($1, $2)
				 RETURNING *`,
				[title, notes ?? null],
			);
			return asTextResult({ created: rows[0] });
		},
	);

	server.registerTool(
		"list_todos",
		{
			title: "List todos",
			description: "List todos with optional filtering by title/notes substring and completion status.",
			inputSchema: z.object({
				query: z
					.string()
					.trim()
					.min(1)
					.optional()
					.describe("Case-insensitive substring of the title or notes."),
				completed: z
					.boolean()
					.optional()
					.describe("true for done todos, false for open ones; omit for both."),
				limit: z
					.number()
					.int()
					.min(1)
					.max(MAX_LIMIT)
					.default(20)
					.describe("Maximum rows to return (default 20)."),
			}),
		},
		async ({ query, completed, limit }) => {
			await ensureSchema();
			const { rows } = await pool.query<Todo>(
				`SELECT * FROM mcp_todos
				 WHERE ($1::text IS NULL OR title ILIKE $1 OR notes ILIKE $1)
				   AND ($2::boolean IS NULL OR completed = $2)
				 ORDER BY completed, id DESC
				 LIMIT $3`,
				[query ? `%${query}%` : null, completed ?? null, limit],
			);
			return asTextResult({ count: rows.length, todos: rows });
		},
	);

	server.registerTool(
		"update_todo",
		{
			title: "Update todo",
			description:
				"Update fields on a todo. Only provided fields change; title and notes cannot be cleared.",
			inputSchema: z.object({
				id: z.number().int().positive().describe("ID of the todo to update."),
				title: optionalText("New title."),
				notes: optionalText("New notes."),
				completed: z
					.boolean()
					.optional()
					.describe("Mark the todo done (true) or open again (false)."),
			}),
		},
		async ({ id, title, notes, completed }) => {
			if (title === undefined && notes === undefined && completed === undefined) {
				return asTextResult({ error: "Provide at least one field to update." }, true);
			}
			await ensureSchema();
			const { rows } = await pool.query<Todo>(
				`UPDATE mcp_todos
				 SET title = COALESCE($1, title),
					 notes = COALESCE($2, notes),
					 completed = COALESCE($3, completed),
					 updated_at = now()
				 WHERE id = $4
				 RETURNING *`,
				[title ?? null, notes ?? null, completed ?? null, id],
			);
			const updated = rows[0];
			if (!updated) {
				return asTextResult({ error: `No todo found with id ${id}.` }, true);
			}
			return asTextResult({ updated });
		},
	);

	server.registerTool(
		"delete_todo",
		{
			title: "Delete todo",
			description: "Delete a todo by ID and return the deleted row.",
			inputSchema: z.object({
				id: z.number().int().positive().describe("ID of the todo to delete."),
			}),
		},
		async ({ id }) => {
			await ensureSchema();
			const { rows } = await pool.query<Todo>(
				`DELETE FROM mcp_todos
				 WHERE id = $1
				 RETURNING *`,
				[id],
			);
			const deleted = rows[0];
			if (!deleted) {
				return asTextResult({ error: `No todo found with id ${id}.` }, true);
			}
			return asTextResult({ deleted });
		},
	);

	return server;
};

const mcpHandler = createMcpHandler(() => createServer(), {
	onerror: (error) => console.error("[mcp-postgres]", error),
});

const app = new Hono();

app.get("/", (c) =>
	c.text(
		"MCP server. Connect an MCP client to /mcp with an Authorization: Bearer token.",
	),
);

app.all("/mcp", (c) => {
	if (!apiKey || c.req.header("authorization") !== `Bearer ${apiKey}`) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	return mcpHandler.fetch(c.req.raw);
});

export default app;
