import { timingSafeEqual } from "node:crypto";
import { handleChatStream } from "@mastra/ai-sdk";
import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import { createTool } from "@mastra/core/tools";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { attachDatabasePool } from "@neon/functions";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { Pool } from "pg";
import { z } from "zod";

// Mastra sends usage telemetry to PostHog unless this is set. Set it to
// "false" to opt in.
process.env.MASTRA_TELEMETRY_DISABLED ??= "true";

// "neon/<model>" is any text model in the AI Gateway catalog:
// https://neon.com/docs/ai-gateway/models
const MODEL = "neon/claude-haiku-5-5";

// The bearer token is the gate, not the origin: no cookies are involved, so any
// origin may call the function as long as it sends the token.
const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Mastra creates its tables (mastra_threads, mastra_messages, mastra_resources,
// ...) on first use, in a mastra schema so they stay out of your public schema.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
attachDatabasePool(pool);
const storage = new PostgresStore({ id: "neon", pool, schemaName: "mastra" });

const memory = new Memory({
	storage,
	options: {
		// The latest messages of the thread are replayed to the model.
		lastMessages: 20,
		// A profile the agent keeps per resourceId, shared by all of its threads.
		workingMemory: {
			enabled: true,
			scope: "resource",
			template: `# User profile
- Name:
- Location and time zone:
- Work and current projects:
- Interests:
- Preferences (tone, format, length):
`,
		},
	},
});

const getCurrentTime = createTool({
	id: "get-current-time",
	description: "Get the current date and time in an IANA time zone.",
	inputSchema: z.object({
		timeZone: z.string().describe("IANA time zone, for example Europe/Berlin"),
	}),
	execute: async ({ timeZone }) => {
		try {
			const time = new Intl.DateTimeFormat("en-US", {
				dateStyle: "full",
				timeStyle: "long",
				timeZone,
			}).format(new Date());
			return { timeZone, time };
		} catch {
			return { error: `Unknown time zone: ${timeZone}` };
		}
	},
});

const assistant = new Agent({
	id: "assistant",
	name: "assistant",
	instructions: `You are a concise personal assistant with long-term memory.
When the user shares a lasting fact about themselves (name, location, work, interests, or preferences), record it in working memory. Answer questions about the user from working memory, and don't ask for facts you already have.
Call get-current-time when the user asks about the current date or time.`,
	model: MODEL,
	memory,
	tools: { getCurrentTime },
});

const mastra = new Mastra({ agents: { assistant }, storage });

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

		// Neon injects these on a linked branch with aiGateway enabled in neon.ts.
		if (
			!process.env.DATABASE_URL ||
			!process.env.NEON_AI_GATEWAY_BASE_URL ||
			!process.env.NEON_AI_GATEWAY_TOKEN
		) {
			return errorResponse(
				"DATABASE_URL or AI Gateway is missing. Run `neon config add ai-gateway`, then `neon deploy --env .env.local`.",
				503,
			);
		}

		let input: unknown;
		try {
			input = await request.json();
		} catch {
			return errorResponse("Expected a JSON body", 400);
		}

		// The body useChat sends ({ id, messages, trigger }) plus a resourceId that
		// your backend sets for the signed-in user. The chat id is the thread id.
		const body =
			input && typeof input === "object" && !Array.isArray(input) ? input : {};
		const { id, messages, trigger, resourceId } = body as Record<
			string,
			unknown
		>;
		const isValidId = (value: unknown) =>
			typeof value === "string" &&
			value.trim().length > 0 &&
			value.length <= 200;
		const isValidMessages =
			Array.isArray(messages) &&
			messages.length > 0 &&
			messages.length <= 100 &&
			messages.every(
				(message) =>
					message &&
					typeof message === "object" &&
					typeof message.id === "string" &&
					["user", "assistant", "system"].includes(message.role) &&
					Array.isArray(message.parts),
			);
		const isValidTrigger =
			trigger === undefined ||
			trigger === "submit-message" ||
			trigger === "regenerate-message";
		if (
			!isValidId(id) ||
			!isValidId(resourceId) ||
			!isValidMessages ||
			!isValidTrigger
		) {
			return errorResponse(
				"Provide id (the thread id), resourceId (1-200 characters each), and 1-100 UI messages",
				400,
			);
		}

		try {
			// Only pass fields the server controls: the rest of params becomes the
			// agent's execution options.
			const stream = await handleChatStream({
				mastra,
				agentId: "assistant",
				version: "v7",
				params: {
					messages: messages as UIMessage[],
					trigger: trigger as "submit-message" | "regenerate-message",
					memory: { thread: id as string, resource: resourceId as string },
					maxSteps: 5,
				},
			});
			// Model errors after this point arrive as error chunks in the stream.
			return createUIMessageStreamResponse({ stream, headers: CORS_HEADERS });
		} catch (error) {
			console.error("Mastra chat failed", error);
			return errorResponse("Chat request failed", 502);
		}
	},
};

function errorResponse(error: string, status: number): Response {
	return Response.json({ error }, { status, headers: CORS_HEADERS });
}
