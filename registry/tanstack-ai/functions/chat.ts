import { timingSafeEqual } from "node:crypto";
import {
	chat,
	chatParamsFromRequestBody,
	maxIterations,
	toolDefinition,
	toServerSentEventsResponse,
} from "@tanstack/ai";
import { neonText } from "@tanstack/ai-neon";
import { z } from "zod";

// Any text model in the AI Gateway catalog: https://neon.com/docs/ai-gateway/models
const MODEL = "claude-haiku-5-5";

const SYSTEM_PROMPT =
	"You are a helpful assistant. Answer concisely. Call getCurrentTime when the user asks about the current date or time.";

// The bearer token is the gate, not the origin: no cookies are involved, so any
// origin may call the function as long as it sends the token.
const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
};

const getCurrentTime = toolDefinition({
	name: "getCurrentTime",
	description: "Get the current date and time in an IANA time zone.",
	inputSchema: z.object({
		timeZone: z
			.string()
			.meta({ description: "IANA time zone, for example Europe/Berlin" }),
	}),
}).server(async ({ timeZone }) => {
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

		const expectedToken = process.env.TANSTACK_AI_FUNCTION_TOKEN;
		if (!expectedToken || expectedToken.length < 32) {
			return errorResponse("TanStack AI function is not configured", 503);
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

		// The AG-UI RunAgentInput body that useChat + fetchServerSentEvents send.
		let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>;
		try {
			params = await chatParamsFromRequestBody(await request.json());
		} catch {
			return errorResponse(
				"Expected an AG-UI RunAgentInput body with threadId, runId, messages, tools, and context",
				400,
			);
		}
		if (params.messages.length === 0) {
			return errorResponse("Provide at least one message", 400);
		}

		const adapter = createAdapter();
		if (!adapter) {
			return errorResponse(
				"AI Gateway is not enabled. Run `neon config add ai-gateway`, then `neon deploy --env .env.local`.",
				503,
			);
		}

		// Aborted when the client disconnects, which cancels the model call.
		const abortController = new AbortController();
		const stream = chat({
			adapter,
			messages: params.messages,
			threadId: params.threadId,
			runId: params.runId,
			systemPrompts: [SYSTEM_PROMPT],
			tools: [getCurrentTime],
			agentLoopStrategy: maxIterations(5),
			abortController,
		});

		// Model errors arrive as RUN_ERROR events in the stream, after the 200.
		return toServerSentEventsResponse(stream, {
			abortController,
			headers: CORS_HEADERS,
		});
	},
};

function errorResponse(error: string, status: number): Response {
	return Response.json({ error }, { status, headers: CORS_HEADERS });
}

// Reads NEON_AI_GATEWAY_BASE_URL and NEON_AI_GATEWAY_TOKEN, which Neon injects
// when aiGateway is enabled in neon.ts. Throws when either is missing.
function createAdapter() {
	try {
		return neonText(MODEL);
	} catch {
		return undefined;
	}
}
