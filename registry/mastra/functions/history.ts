import { timingSafeEqual } from "node:crypto";
import { toAISdkMessages } from "@mastra/ai-sdk/ui";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { attachDatabasePool } from "@neon/functions";
import { Pool } from "pg";

// Mastra sends usage telemetry to PostHog unless this is set. Set it to
// "false" to opt in.
process.env.MASTRA_TELEMETRY_DISABLED ??= "true";

// Messages returned per request: the newest ones, oldest first.
const MAX_MESSAGES = 100;

// The bearer token is the gate, not the origin: no cookies are involved, so any
// origin may call the function as long as it sends the token.
const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Reads the threads and messages that /chat stores.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
attachDatabasePool(pool);
const memory = new Memory({
	storage: new PostgresStore({ id: "neon", pool, schemaName: "mastra" }),
});

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}
		if (request.method !== "POST") {
			return new Response(null, {
				status: 405,
				headers: { ...CORS_HEADERS, Allow: "POST, OPTIONS" },
			});
		}

		const expectedToken = process.env.MASTRA_FUNCTION_TOKEN;
		if (!expectedToken || expectedToken.length < 32) {
			return errorResponse("Mastra function is not configured", 503);
		}

		const providedToken =
			request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
		const expectedBytes = Buffer.from(expectedToken);
		const providedBytes = Buffer.from(providedToken);
		const isAuthorized =
			providedBytes.length === expectedBytes.length &&
			timingSafeEqual(providedBytes, expectedBytes);
		if (!isAuthorized) {
			return errorResponse("Unauthorized", 401);
		}

		if (!process.env.DATABASE_URL) {
			return errorResponse(
				"DATABASE_URL is missing. Run `neon link` on a branch first.",
				503,
			);
		}

		let input: unknown;
		try {
			input = await request.json();
		} catch {
			return errorResponse("Expected a JSON body", 400);
		}

		const body =
			input && typeof input === "object" && !Array.isArray(input) ? input : {};
		const { threadId, resourceId } = body as Record<string, unknown>;
		const isValidId = (value: unknown) =>
			typeof value === "string" &&
			value.trim().length > 0 &&
			value.length <= 200;
		if (!isValidId(threadId) || !isValidId(resourceId)) {
			return errorResponse(
				"Provide threadId and resourceId (1-200 characters each)",
				400,
			);
		}

		try {
			// A thread that belongs to another resourceId reads as missing.
			const thread = await memory.getThreadById({
				threadId: threadId as string,
			});
			if (!thread || thread.resourceId !== resourceId) {
				return errorResponse("Thread not found", 404);
			}
			const { messages } = await memory.recall({
				threadId: threadId as string,
				resourceId: resourceId as string,
				perPage: MAX_MESSAGES,
			});
			// The UIMessage shape useChat takes as its initial messages.
			return Response.json(
				{ threadId, messages: toAISdkMessages(messages, { version: "v7" }) },
				{ headers: CORS_HEADERS },
			);
		} catch (error) {
			console.error("Mastra history failed", error);
			return errorResponse("History request failed", 502);
		}
	},
};

function errorResponse(error: string, status: number): Response {
	return Response.json({ error }, { status, headers: CORS_HEADERS });
}
