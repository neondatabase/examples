import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { attachDatabasePool } from "@neon/functions";
import { createMcpAuth } from "@neon/oauth/mcp";
import { honoMcp, type McpAuthVariables } from "@neon/oauth/mcp/hono";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgEnum, pgTable, primaryKey, smallint, text, timestamp } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Pool } from "pg";
import { z } from "zod";

const COLUMNS = ["A", "B", "C", "D", "E"] as const;
const COLORS = ["white", "red", "orange", "yellow", "green", "blue", "purple", "black"] as const;

export const canvasColumn = pgEnum("mcp_canvas_column", COLUMNS);
export const canvasColor = pgEnum("mcp_canvas_color", COLORS);

export const canvasSquares = pgTable(
	"mcp_canvas_squares",
	{
		x: canvasColumn("x").notNull(),
		y: smallint("y").notNull(),
		color: canvasColor("color").notNull(),
		paintedBy: text("painted_by").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [primaryKey({ columns: [table.x, table.y] })],
);

const authBaseUrl = process.env.NEON_AUTH_BASE_URL;
const mcpResource = process.env.MCP_RESOURCE;

const pool = new Pool({
	connectionString: process.env.DATABASE_URL?.replace("sslmode=require", "sslmode=verify-full"),
	max: 5,
});
attachDatabasePool(pool);
const db = drizzle(pool);

const asResult = <T extends Record<string, unknown>>(payload: T) => ({
	content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
	structuredContent: payload,
});

const createServer = (userId: string) => {
	const server = new McpServer({ name: "mcp-oauth", version: "1.0.0" });

	server.registerTool(
		"whoami",
		{
			title: "Who am I",
			description: "Return the signed-in user's ID and the OAuth client and scopes this session was granted.",
			inputSchema: {},
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async (_args, extra) =>
			asResult({
				userId,
				clientId: extra.authInfo?.clientId ?? null,
				scopes: extra.authInfo?.scopes ?? [],
			}),
	);

	server.registerTool(
		"view_canvas",
		{
			title: "View the canvas",
			description: "Show the shared 5 by 5 canvas: every square's color and who painted it last.",
			inputSchema: {},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async () => {
			const rows = await db.select().from(canvasSquares);
			const painted = new Map(rows.map((row) => [`${row.x}${row.y}`, row]));
			const squares = [1, 2, 3, 4, 5].flatMap((y) =>
				COLUMNS.map((x) => {
					const row = painted.get(`${x}${y}`);
					return {
						square: `${x}${y}`,
						color: row?.color ?? "white",
						paintedBy: row?.paintedBy ?? null,
					};
				}),
			);
			return asResult({ squares });
		},
	);

	server.registerTool(
		"paint_square",
		{
			title: "Paint a square",
			description: "Paint one square on the shared 5 by 5 canvas as the signed-in user.",
			inputSchema: {
				x: z.enum(COLUMNS).describe("Grid column from A through E."),
				y: z.number().int().min(1).max(5).describe("Grid row from 1 through 5."),
				color: z.enum(COLORS).describe("The new square color."),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async ({ x, y, color }) => {
			const [square] = await db
				.insert(canvasSquares)
				.values({ x, y, color, paintedBy: userId })
				.onConflictDoUpdate({
					target: [canvasSquares.x, canvasSquares.y],
					set: { color, paintedBy: userId, updatedAt: new Date() },
				})
				.returning();
			return asResult({
				square: `${square!.x}${square!.y}`,
				color: square!.color,
				paintedBy: square!.paintedBy,
			});
		},
	);

	return server;
};

const app = new Hono<McpAuthVariables>();

app.get("/", (c) =>
	c.text(
		"MCP server with OAuth. Connect an MCP client to /mcp; it signs you in through /auth/sign-in and /auth/consent.",
	),
);
app.get("/favicon.ico", (c) => c.body(null, 204));

const pageScript = (issuer: string) => `
const ISSUER = ${JSON.stringify(issuer).replace(/</g, "\\u003c")};
const params = new URLSearchParams(location.search);
const hasOAuthQuery = params.has("client_id") && params.has("response_type") && params.has("sig");

function oauthQuery() {
	if (!hasOAuthQuery) return undefined;
	const names = new Set(params.getAll("ba_param"));
	const signed = new URLSearchParams();
	for (const [key, value] of params) {
		if (key === "sig" || key === "ba_param" || names.has(key)) signed.append(key, value);
	}
	return signed.toString();
}

async function auth(path, body) {
	const res = await fetch(ISSUER + path, {
		method: body ? "POST" : "GET",
		credentials: "include",
		headers: body ? { "content-type": "application/json" } : {},
		body: body ? JSON.stringify(body) : undefined,
	});
	const data = await res.json().catch(() => null);
	if (!res.ok) {
		throw new Error(data?.message || data?.error_description || data?.error || "Request failed with status " + res.status);
	}
	return data;
}

function follow(data) {
	if (data?.url) {
		location.assign(data.url);
		return true;
	}
	return false;
}

async function resume() {
	follow(await auth("/oauth2/continue", { selected: true, oauth_query: oauthQuery() }));
}

function showError(error) {
	const el = document.getElementById("error");
	el.textContent = error instanceof Error ? error.message : String(error);
	el.hidden = false;
}

function setPending(form, pending) {
	for (const el of form.elements) el.disabled = pending;
}
`;

const signInScript = `
const form = document.getElementById("form");
document.getElementById("sign-up").href = "/auth/sign-up" + location.search;
if (!hasOAuthQuery) document.getElementById("no-request").hidden = false;

const prompts = (params.get("prompt") ?? "").split(" ");
if (hasOAuthQuery && !prompts.includes("login") && !prompts.includes("create")) {
	auth("/get-session")
		.then((session) => (session?.user ? resume() : undefined))
		.catch(showError);
}

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	setPending(form, true);
	try {
		const data = await auth("/sign-in/email", {
			email: form.email.value,
			password: form.password.value,
			oauth_query: oauthQuery(),
		});
		if (follow(data)) return;
		if (hasOAuthQuery) await resume();
		else showError("Signed in. Return to your MCP client to connect.");
	} catch (error) {
		showError(error);
	} finally {
		setPending(form, false);
	}
});
`;

const signUpScript = `
const form = document.getElementById("form");
document.getElementById("sign-in").href = "/auth/sign-in" + location.search;

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	setPending(form, true);
	try {
		const data = await auth("/sign-up/email", {
			name: form.name.value,
			email: form.email.value,
			password: form.password.value,
			oauth_query: oauthQuery(),
		});
		if (follow(data)) return;
		if (!data?.token) showError("Check your email to verify your account, then sign in.");
		else if (hasOAuthQuery) await resume();
		else showError("Account created. Return to your MCP client to connect.");
	} catch (error) {
		showError(error);
	} finally {
		setPending(form, false);
	}
});
`;

const consentScript = `
const form = document.getElementById("form");

function host(uri) {
	try {
		return new URL(uri).host;
	} catch {
		return uri;
	}
}

function isLoopback(uri) {
	try {
		return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(uri).hostname);
	} catch {
		return false;
	}
}

function show(id, text) {
	if (!text) return;
	document.getElementById(id).textContent = text;
	document.getElementById(id + "-row").hidden = false;
}

async function load() {
	if (!hasOAuthQuery) throw new Error("Open this page from an MCP client.");
	const session = await auth("/get-session");
	if (!session?.user) {
		location.replace("/auth/sign-in" + location.search);
		return;
	}
	const client = await auth("/oauth2/public-client?client_id=" + encodeURIComponent(params.get("client_id")));
	const redirectUri = params.get("redirect_uri") ?? "";
	document.getElementById("client-name").textContent = client.client_name || "An application";
	document.getElementById("user").textContent = session.user.email;
	show("client-uri", client.client_uri && host(client.client_uri));
	show("redirects", redirectUri && host(redirectUri));
	show("scope", params.get("scope"));
	show("resource", params.getAll("resource").join(", "));
	document.getElementById("loopback").hidden = !isLoopback(redirectUri);
	form.hidden = false;
}

async function answer(accept) {
	setPending(form, true);
	try {
		const data = await auth("/oauth2/consent", { accept, oauth_query: oauthQuery() });
		if (!follow(data)) throw new Error("This request expired. Return to your MCP client and try again.");
	} catch (error) {
		showError(error);
		setPending(form, false);
	}
}

document.getElementById("allow").addEventListener("click", () => answer(true));
document.getElementById("deny").addEventListener("click", () => answer(false));
load().catch(showError);
`;

const page = (title: string, body: string, script: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
	body { font-family: system-ui, sans-serif; max-width: 26rem; margin: 4rem auto; padding: 0 1rem; color: #111; }
	label { display: block; margin: 0.75rem 0; font-weight: 600; }
	input { display: block; width: 100%; box-sizing: border-box; margin-top: 0.25rem; padding: 0.5rem; font: inherit; }
	button { padding: 0.5rem 1rem; font: inherit; cursor: pointer; }
	dt { font-weight: 600; margin-top: 0.75rem; }
	dd { margin: 0; overflow-wrap: anywhere; }
	.note { padding: 0.75rem; border: 1px solid #d4a72c; background: #fff8c5; }
	#error { color: #b42318; }
</style>
</head>
<body>
${body}
<p id="error" role="alert" hidden></p>
<script>${pageScript(authBaseUrl ?? "")}${script}</script>
</body>
</html>`;

const signInPage = page(
	"Sign in",
	`<h1>Sign in</h1>
<p>Sign in to let your MCP client act on your behalf.</p>
<p id="no-request" class="note" hidden>No authorization request found. Connect from an MCP client to start one.</p>
<form id="form">
	<label>Email <input name="email" type="email" autocomplete="email" required></label>
	<label>Password <input name="password" type="password" autocomplete="current-password" required></label>
	<button type="submit">Sign in</button>
</form>
<p>No account yet? <a id="sign-up" href="/auth/sign-up">Create one</a></p>`,
	signInScript,
);

const signUpPage = page(
	"Create an account",
	`<h1>Create an account</h1>
<form id="form">
	<label>Name <input name="name" autocomplete="name" required></label>
	<label>Email <input name="email" type="email" autocomplete="email" required></label>
	<label>Password <input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
	<button type="submit">Create account</button>
</form>
<p>Already have an account? <a id="sign-in" href="/auth/sign-in">Sign in</a></p>`,
	signUpScript,
);

const consentPage = page(
	"Allow access",
	`<h1>Allow <span id="client-name">this client</span>?</h1>
<form id="form" hidden>
	<p>It wants to call this MCP server's tools as <strong id="user"></strong>.</p>
	<dl>
		<div id="client-uri-row" hidden><dt>Client website</dt><dd id="client-uri"></dd></div>
		<div id="redirects-row" hidden><dt>Returns to</dt><dd id="redirects"></dd></div>
		<div id="scope-row" hidden><dt>Requested access</dt><dd id="scope"></dd></div>
		<div id="resource-row" hidden><dt>Resource</dt><dd id="resource"></dd></div>
	</dl>
	<p id="loopback" class="note" hidden>This client returns to an app on your own computer, and its name is not proof of who built it. Continue only if you started it.</p>
	<button id="deny" type="button">Deny</button>
	<button id="allow" type="button">Allow</button>
</form>`,
	consentScript,
);

const pageHeaders = {
	"Cache-Control": "no-store",
	"Content-Security-Policy": "frame-ancestors 'none'",
	"Referrer-Policy": "no-referrer",
};

if (authBaseUrl && mcpResource) {
	const mcpAuth = createMcpAuth({ baseUrl: authBaseUrl, resource: mcpResource });

	app.get("/auth/sign-in", (c) => c.html(signInPage, 200, pageHeaders));
	app.get("/auth/sign-up", (c) => c.html(signUpPage, 200, pageHeaders));
	app.get("/auth/consent", (c) => c.html(consentPage, 200, pageHeaders));

	app.use(
		"/mcp",
		cors({
			origin: "*",
			allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
			allowHeaders: ["Authorization", "Content-Type", "Mcp-Protocol-Version", "Mcp-Session-Id"],
			exposeHeaders: ["Mcp-Session-Id", "WWW-Authenticate"],
		}),
	);
	app.use(honoMcp(mcpAuth, { path: "/mcp", onError: (error) => console.error("[mcp-oauth]", error) }));

	app.all("/mcp", async (c) => {
		const server = createServer(c.get("auth").sub);
		const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
		await server.connect(transport);
		return transport.handleRequest(c.req.raw, { authInfo: c.get("authInfo") });
	});
} else {
	const missing = [
		authBaseUrl ? null : "NEON_AUTH_BASE_URL (set auth: true in neon.ts and run neon deploy)",
		mcpResource ? null : "MCP_RESOURCE (set it to this function's public URL plus /mcp and redeploy)",
	].filter(Boolean);
	app.all("*", (c) => c.json({ error: "MCP server is not configured", missing }, 503));
}

app.onError((error, c) => {
	console.error("[mcp-oauth]", error);
	return c.json({ error: "Internal server error" }, 500);
});

export default app;
