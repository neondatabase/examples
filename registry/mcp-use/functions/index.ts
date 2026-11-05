// Adapted from mcp-use/mcp-use#2988 (Apache-2.0), by Manufact.
import { and, eq, gte, ilike, lt, or } from "drizzle-orm";
import { z } from "zod";
import { MCPServer } from "mcp-use";
import { attachDatabasePool } from "@neon/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { Pool } from "pg";

const events = pgTable("mcp_use_events", {
	id: serial("id").primaryKey(),
	title: text("title").notNull(),
	startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
	location: text("location"),
	description: text("description"),
	url: text("url"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);
const db = drizzle(pool);
let schemaReady: Promise<void> | undefined;

// No database work at import time. Retry initialization after a transient failure.
function ensureSchema(): Promise<void> {
	schemaReady ??= pool
		.query(
			`
    CREATE TABLE IF NOT EXISTS mcp_use_events (
      id serial PRIMARY KEY,
      title text NOT NULL,
      starts_at timestamptz NOT NULL,
      location text,
      description text,
      url text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `,
		)
		.then(() => undefined)
		.catch((error) => {
			schemaReady = undefined;
			throw error;
		});
	return schemaReady;
}

// A fresh schema per field keeps descriptions distinct in the tool schema.
const optionalText = (description: string) =>
	z.string().trim().min(1).optional().describe(description);

// Require an explicit UTC offset so event times never depend on the host timezone.
const dateTime = (description: string) =>
	z.iso.datetime({ offset: true }).describe(description);

function asTextResult(payload: unknown, isError = false) {
	return {
		isError,
		content: [
			{ type: "text" as const, text: JSON.stringify(payload, null, 2) },
		],
	};
}

// Registry templates must not send unsolicited SDK telemetry.
process.env.MCP_USE_ANONYMIZED_TELEMETRY = "false";

const server = new MCPServer({
	name: "neon-events",
	version: "1.0.0",
	websiteUrl: "https://manufact.com/",
	skills: false,
});

server.tool(
	{
		name: "create_event",
		title: "Create event",
		description:
			"Create an event with a title and start time in the event database.",
		inputSchema: z.object({
			title: z
				.string()
				.trim()
				.min(1)
				.describe("Title of the event (required)."),
			startsAt: dateTime(
				"Start time in ISO 8601 format with Z or a UTC offset, such as 2026-11-20T18:00:00-08:00.",
			),
			location: optionalText("Venue, address, or online meeting location."),
			description: optionalText("What the event is about."),
			url: z
				.url()
				.optional()
				.describe("Event information or registration URL."),
		}),
	},
	async ({ title, startsAt, location, description, url }) => {
		await ensureSchema();
		const [row] = await db
			.insert(events)
			.values({
				title,
				startsAt: new Date(startsAt),
				location,
				description,
				url,
			})
			.returning();
		return asTextResult({ created: row });
	},
);

server.tool(
	{
		name: "update_event",
		title: "Update event",
		description: "Update an existing event. Only provided fields are changed.",
		inputSchema: z.object({
			id: z.number().int().positive().describe("ID of the event to update."),
			title: optionalText("New event title."),
			startsAt: dateTime(
				"New start time in ISO 8601 format with Z or a UTC offset.",
			).optional(),
			location: optionalText("New venue, address, or online meeting location."),
			description: optionalText("New event description."),
			url: z
				.url()
				.optional()
				.describe("New event information or registration URL."),
		}),
	},
	async ({ id, startsAt, ...fields }) => {
		const updates = Object.fromEntries(
			Object.entries({
				...fields,
				startsAt: startsAt === undefined ? undefined : new Date(startsAt),
			}).filter(([, value]) => value !== undefined),
		);
		if (Object.keys(updates).length === 0) {
			return asTextResult(
				{ error: "Provide at least one field to update." },
				true,
			);
		}
		await ensureSchema();
		const [row] = await db
			.update(events)
			.set({ ...updates, updatedAt: new Date() })
			.where(eq(events.id, id))
			.returning();
		if (!row) {
			return asTextResult({ error: `No event found with id ${id}.` }, true);
		}
		return asTextResult({ updated: row });
	},
);

server.tool(
	{
		name: "delete_event",
		title: "Delete event",
		description: "Delete an event by ID.",
		inputSchema: z.object({
			id: z.number().int().positive().describe("ID of the event to delete."),
		}),
	},
	async ({ id }) => {
		await ensureSchema();
		const [row] = await db.delete(events).where(eq(events.id, id)).returning();
		if (!row) {
			return asTextResult({ error: `No event found with id ${id}.` }, true);
		}
		return asTextResult({ deleted: row });
	},
);

server.tool(
	{
		name: "search_events",
		title: "Search events",
		description:
			"Search events by title, location, or description, optionally within a date range. Omit filters to list all events, ordered by start time.",
		inputSchema: z
			.object({
				query: z
					.string()
					.trim()
					.min(1)
					.optional()
					.describe(
						"Case-insensitive substring to match; omit to list all events.",
					),
				from: dateTime(
					"Include events starting at or after this ISO 8601 time (with Z or a UTC offset).",
				).optional(),
				to: dateTime(
					"Include events starting before this ISO 8601 time (with Z or a UTC offset).",
				).optional(),
				limit: z
					.number()
					.int()
					.positive()
					.max(100)
					.default(20)
					.describe(
						"Maximum number of events to return (default 20, max 100).",
					),
			})
			.refine(
				({ from, to }) => !from || !to || new Date(from) < new Date(to),
				"from must be earlier than to.",
			),
	},
	async ({ query, from, to, limit }) => {
		const where = query
			? or(
					ilike(events.title, `%${query}%`),
					ilike(events.location, `%${query}%`),
					ilike(events.description, `%${query}%`),
				)
			: undefined;
		await ensureSchema();
		const rows = await db
			.select()
			.from(events)
			.where(
				and(
					where,
					from ? gte(events.startsAt, new Date(from)) : undefined,
					to ? lt(events.startsAt, new Date(to)) : undefined,
				),
			)
			.orderBy(events.startsAt, events.id)
			.limit(limit);
		return asTextResult({ count: rows.length, events: rows });
	},
);

server.get("/", (c) =>
	c.text("Neon events MCP server — connect an MCP client to POST /mcp"),
);

const apiKey = process.env.MCP_API_KEY;

/** Neon invokes this authenticated fetch handler directly. */
export default {
	async fetch(request: Request): Promise<Response> {
		// Gate the whole server, including transport and inspector routes.
		if (
			!apiKey ||
			request.headers.get("authorization") !== `Bearer ${apiKey}`
		) {
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		}
		return server.fetch(request);
	},
};
