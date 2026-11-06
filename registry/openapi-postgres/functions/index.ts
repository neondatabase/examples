import { swaggerUI } from "@hono/swagger-ui";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { attachDatabasePool } from "@neon/functions";
import { HTTPException } from "hono/http-exception";
import { Pool } from "pg";

const DEFAULT_LIMIT = 50;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

let schema: Promise<void> | undefined;

function ensureSchema(): Promise<void> {
	schema ??= pool
		.query(
			`CREATE TABLE IF NOT EXISTS bookmarks (
				id serial PRIMARY KEY,
				url text NOT NULL,
				title text NOT NULL,
				tags text[] NOT NULL DEFAULT '{}',
				created_at timestamptz NOT NULL DEFAULT now(),
				updated_at timestamptz NOT NULL DEFAULT now()
			);
			CREATE INDEX IF NOT EXISTS bookmarks_tags_idx ON bookmarks USING gin (tags)`,
		)
		.then(() => undefined)
		.catch((error) => {
			schema = undefined;
			throw error;
		});

	return schema;
}

type BookmarkRow = {
	id: number;
	url: string;
	title: string;
	tags: string[];
	createdAt: Date;
	updatedAt: Date;
};

const COLUMNS = `id, url, title, tags,
	created_at AS "createdAt", updated_at AS "updatedAt"`;

const bookmarkUrl = z.string().url().max(2048).openapi({ example: "https://neon.com/docs" });
const bookmarkTitle = z
	.string()
	.min(1)
	.max(200)
	.regex(/\S/)
	.openapi({ example: "Neon documentation" });
const bookmarkTags = z
	.array(z.string().min(1).max(32))
	.max(10)
	.openapi({ example: ["postgres"] });

const BookmarkSchema = z
	.object({
		id: z.number().int().positive().openapi({ example: 1 }),
		url: bookmarkUrl,
		title: bookmarkTitle,
		tags: bookmarkTags,
		createdAt: z.string().datetime().openapi({ example: "2026-01-01T00:00:00.000Z" }),
		updatedAt: z.string().datetime().openapi({ example: "2026-01-01T00:00:00.000Z" }),
	})
	.openapi("Bookmark");

const ErrorSchema = z
	.object({ error: z.string().openapi({ example: "Request failed" }) })
	.openapi("Error");

const json = <T extends z.ZodType>(schema: T) => ({
	content: { "application/json": { schema } },
});

const error = (description: string) => ({ description, ...json(ErrorSchema) });

// Path parameters arrive as strings; coerce the id to the number the API declares.
const IdParamsSchema = z.object({
	id: z.coerce.number().int().positive().openapi({ example: 1 }),
});

const ListQuerySchema = z.object({
	tag: z.string().min(1).max(32).optional().openapi({ example: "postgres" }),
	limit: z
		.coerce.number()
		.int()
		.min(1)
		.max(100)
		.default(DEFAULT_LIMIT)
		.openapi({ param: { name: "limit", in: "query" }, example: DEFAULT_LIMIT }),
});

const CreateBodySchema = z.object({
	url: bookmarkUrl,
	title: bookmarkTitle,
	tags: bookmarkTags.default([]),
});

const UpdateBodySchema = z.object({
	title: bookmarkTitle.optional(),
	tags: bookmarkTags.optional(),
});

const app = new OpenAPIHono({
	defaultHook: (result, c) => {
		if (!result.success) return c.json({ error: "Invalid request" }, 400);
	},
});

app.openapi(
	createRoute({
		method: "get",
		path: "/bookmarks",
		summary: "List bookmarks",
		request: { query: ListQuerySchema },
		responses: {
			200: { description: "Bookmarks, newest first.", ...json(z.array(BookmarkSchema)) },
			400: error("A query parameter is invalid."),
		},
	}),
	async (c) => {
		await ensureSchema();
		const { tag, limit } = c.req.valid("query");
		const { rows } = await pool.query<BookmarkRow>(
			`SELECT ${COLUMNS}
			 FROM bookmarks
			 WHERE $1::text IS NULL OR $1 = ANY(tags)
			 ORDER BY created_at DESC, id DESC
			 LIMIT $2`,
			[tag ?? null, limit],
		);
		return c.json(rows, 200);
	},
);

app.openapi(
	createRoute({
		method: "post",
		path: "/bookmarks",
		summary: "Create a bookmark",
		request: {
			body: {
				required: true,
				content: { "application/json": { schema: CreateBodySchema } },
			},
		},
		responses: {
			201: { description: "The created bookmark.", ...json(BookmarkSchema) },
			400: error("The body is invalid."),
		},
	}),
	async (c) => {
		await ensureSchema();
		const { url, title, tags } = c.req.valid("json");
		const { rows } = await pool.query<BookmarkRow>(
			`INSERT INTO bookmarks (url, title, tags)
			 VALUES ($1, $2, $3)
			 RETURNING ${COLUMNS}`,
			[url, title, tags],
		);
		return c.json(rows[0]!, 201);
	},
);

app.openapi(
	createRoute({
		method: "get",
		path: "/bookmarks/{id}",
		summary: "Get a bookmark",
		request: { params: IdParamsSchema },
		responses: {
			200: { description: "The bookmark.", ...json(BookmarkSchema) },
			400: error("The id is invalid."),
			404: error("No bookmark has that id."),
		},
	}),
	async (c) => {
		await ensureSchema();
		const { id } = c.req.valid("param");
		const { rows } = await pool.query<BookmarkRow>(
			`SELECT ${COLUMNS} FROM bookmarks WHERE id = $1`,
			[id],
		);
		const row = rows[0];
		return row ? c.json(row, 200) : c.json({ error: "Bookmark not found" }, 404);
	},
);

app.openapi(
	createRoute({
		method: "patch",
		path: "/bookmarks/{id}",
		summary: "Update a bookmark",
		request: {
			params: IdParamsSchema,
			body: {
				required: true,
				content: { "application/json": { schema: UpdateBodySchema } },
			},
		},
		responses: {
			200: { description: "The updated bookmark.", ...json(BookmarkSchema) },
			400: error("The id or body is invalid."),
			404: error("No bookmark has that id."),
		},
	}),
	async (c) => {
		await ensureSchema();
		const { id } = c.req.valid("param");
		const { title, tags } = c.req.valid("json");
		if (title === undefined && tags === undefined) {
			return c.json({ error: "Provide title or tags" }, 400);
		}
		const { rows } = await pool.query<BookmarkRow>(
			`UPDATE bookmarks
			 SET title = COALESCE($1, title), tags = COALESCE($2, tags), updated_at = now()
			 WHERE id = $3
			 RETURNING ${COLUMNS}`,
			[title ?? null, tags ?? null, id],
		);
		const row = rows[0];
		return row ? c.json(row, 200) : c.json({ error: "Bookmark not found" }, 404);
	},
);

app.openapi(
	createRoute({
		method: "delete",
		path: "/bookmarks/{id}",
		summary: "Delete a bookmark",
		request: { params: IdParamsSchema },
		responses: {
			204: { description: "The bookmark was deleted." },
			400: error("The id is invalid."),
			404: error("No bookmark has that id."),
		},
	}),
	async (c) => {
		await ensureSchema();
		const { id } = c.req.valid("param");
		const { rowCount } = await pool.query("DELETE FROM bookmarks WHERE id = $1", [id]);
		return rowCount ? c.body(null, 204) : c.json({ error: "Bookmark not found" }, 404);
	},
);

app.get("/", (c) => c.redirect("/docs"));

app.doc31("/openapi.json", {
	openapi: "3.1.0",
	info: {
		version: "1.0.0",
		title: "Bookmarks API",
		description: "A typed CRUD API built with Hono, Zod, and Neon Postgres.",
	},
	servers: [{ url: "/" }],
});

app.get("/docs", swaggerUI({ url: "/openapi.json" }));

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((error, c) => {
	if (error instanceof HTTPException) {
		return c.json({ error: error.message }, error.status);
	}
	console.error("[openapi-postgres] failed:", error);
	return c.json({ error: "Internal server error" }, 500);
});

export default app;
