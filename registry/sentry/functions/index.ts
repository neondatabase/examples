import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/node";
import { Hono } from "hono";

Sentry.init({
	dsn: process.env.SENTRY_DSN,
	enabled: Boolean(process.env.SENTRY_DSN),
	tracesSampleRate: 1,
	integrations: [
		Sentry.httpIntegration({ disableIncomingRequestSpans: true }),
	],
	environment:
		!process.env.NEON_BRANCH || process.env.NEON_BRANCH === "main"
			? "production"
			: process.env.NEON_BRANCH,
});

process.on("SIGTERM", () => void Sentry.flush(2000));
process.on("SIGINT", () => void Sentry.flush(2000));

type Todo = { id: string; title: string; done: boolean };

// In-memory todo store
const todos = new Map<string, Todo>();

const app = new Hono();

app.use("*", (c, next) =>
	Sentry.withIsolationScope(() =>
		Sentry.startSpan(
			{
				op: "http.server",
				name: `${c.req.method} ${c.req.path}`,
				forceTransaction: true,
				attributes: {
					"http.request.method": c.req.method,
					"url.path": c.req.path,
				},
			},
			async (span) => {
				await next();
				span.setAttribute("http.response.status_code", c.res.status);
			},
		).finally(() => Sentry.flush(2000)),
	),
);

app.get("/", (c) =>
	c.json({
		name: "Sentry-instrumented API",
		routes: [
			"GET /health",
			"GET /todos/:id",
			"POST /todos",
			"GET /debug-sentry",
		],
	}),
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/todos/:id", (c) => {
	const todo = todos.get(c.req.param("id"));
	return todo ? c.json(todo) : c.json({ error: "Todo not found" }, 404);
});

app.post("/todos", async (c) => {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Expected a JSON body" }, 400);
	}

	const input =
		body && typeof body === "object" && !Array.isArray(body)
			? (body as Record<string, unknown>)
			: {};
	const title = input.title;
	if (typeof title !== "string" || title.trim() === "") {
		return c.json({ error: "title must be a non-empty string" }, 400);
	}

	const simulateRetry = input.simulate_retry === true;

	Sentry.logger.info("creating todo", {
		component: "api",
		title,
	});

	try {
		const todo = await Sentry.startSpan(
			{ name: "todo.save", attributes: { title } },
			() => saveTodo(title, simulateRetry),
		);
		Sentry.logger.info("todo created", {
			component: "api",
			todoId: todo.id,
		});
		return c.json(todo, 201);
	} catch (error) {
		// Only unrecoverable errors become issues; recovered ones are logged.
		Sentry.captureException(error, {
			tags: { component: "api", phase: "save" },
			contexts: { todo: { title } },
		});
		return c.json({ error: "todo_save_failed" }, 502);
	}
});

// Saving is retried once. `simulate_retry` makes the first attempt fail so the
// recovered failure is logged without becoming an issue.
function saveTodo(title: string, simulateRetry: boolean): Todo {
	const todo: Todo = { id: randomUUID(), title: title.trim(), done: false };
	if (simulateRetry) {
		try {
			writeTodo(todo, true);
			return todo;
		} catch (error) {
			Sentry.logger.warn("first save attempt failed, retrying", {
				component: "api",
				phase: "save-attempt",
				error: String(error),
			});
		}
	}
	writeTodo(todo, false);
	return todo;
}

function writeTodo(todo: Todo, fail: boolean) {
	if (fail) {
		throw new Error(`could not save todo ${todo.id}`);
	}
	todos.set(todo.id, todo);
}

app.get("/debug-sentry", () => {
	throw new Error("sentry test: unhandled route error");
});

app.onError((error, c) => {
	Sentry.captureException(error);
	return c.json({ error: "internal_error" }, 500);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
