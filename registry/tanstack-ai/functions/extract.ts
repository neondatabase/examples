import { timingSafeEqual } from "node:crypto";
import { chat } from "@tanstack/ai";
import { neonText } from "@tanstack/ai-neon";
import { z } from "zod";

const MODEL = "claude-haiku-5-5";

const SYSTEM_PROMPT =
	"Extract structured data from the user's text. Use empty arrays for anything the text does not mention.";

const ExtractRequestSchema = z.object({
	text: z.string().trim().min(1).max(20_000),
});

const ExtractionSchema = z.object({
	title: z.string().meta({ description: "A short title for the text" }),
	people: z.array(z.string()).meta({ description: "People mentioned" }),
	organizations: z
		.array(z.string())
		.meta({ description: "Companies and organizations mentioned" }),
	locations: z.array(z.string()).meta({ description: "Places mentioned" }),
	dates: z
		.array(z.string())
		.meta({ description: "Dates and times mentioned, as written" }),
	sentiment: z.enum(["positive", "neutral", "negative"]),
});

const GatewayErrorSchema = z.object({ code: z.string() });

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
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

		const body = ExtractRequestSchema.safeParse(
			await request.json().catch(() => null),
		);
		if (!body.success) {
			return errorResponse("Provide text of 1-20000 characters", 400);
		}

		const adapter = createAdapter();
		if (!adapter) {
			return errorResponse(
				"AI Gateway is not enabled. Run `neon config add ai-gateway`, then `neon deploy --env .env.local`.",
				503,
			);
		}

		try {
			const data = await chat({
				adapter,
				messages: [{ role: "user", content: body.data.text }],
				threadId: crypto.randomUUID(),
				systemPrompts: [SYSTEM_PROMPT],
				outputSchema: ExtractionSchema,
			});
			return Response.json({ data, model: MODEL });
		} catch (error) {
			return gatewayErrorResponse(error);
		}
	},
};

function errorResponse(error: string, status: number): Response {
	return Response.json({ error }, { status });
}

function gatewayErrorResponse(error: unknown): Response {
	switch (GatewayErrorSchema.safeParse(error).data?.code) {
		case "429":
			return errorResponse("AI Gateway rate limit reached", 429);
		case "401":
		case "403":
			return errorResponse("AI Gateway rejected the credentials", 502);
		default:
			return errorResponse("Model request failed", 502);
	}
}

function createAdapter() {
	try {
		return neonText(MODEL);
	} catch {
		return undefined;
	}
}
