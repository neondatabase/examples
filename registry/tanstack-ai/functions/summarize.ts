import { timingSafeEqual } from "node:crypto";
import { summarize } from "@tanstack/ai";
import { neonSummarize } from "@tanstack/ai-neon";
import { z } from "zod";

const MODEL = "claude-haiku-5-5";

const SummarizeRequestSchema = z.object({
	text: z.string().trim().min(1).max(50_000),
	style: z.enum(["paragraph", "bullet-points", "concise"]).default("paragraph"),
	maxLength: z.int().min(100).max(2000).default(300),
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

		const body = SummarizeRequestSchema.safeParse(
			await request.json().catch(() => null),
		);
		if (!body.success) {
			return errorResponse(
				"Provide text (1-50000 characters), style (paragraph, bullet-points, or concise), and maxLength (100-2000 tokens)",
				400,
			);
		}

		const adapter = createAdapter();
		if (!adapter) {
			return errorResponse(
				"AI Gateway is not enabled. Run `neon config add ai-gateway`, then `neon deploy --env .env.local`.",
				503,
			);
		}

		const { text, style, maxLength } = body.data;
		try {
			const { summary, usage } = await summarize({
				adapter,
				text,
				style,
				maxLength,
				modelOptions: { max_tokens: maxLength * 2 },
				threadId: crypto.randomUUID(),
			});
			return Response.json({ summary, model: MODEL, usage });
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
		case "max_tokens":
			return errorResponse(
				"The summary was cut off at the output limit; raise maxLength",
				502,
			);
		default:
			return errorResponse("Model request failed", 502);
	}
}

function createAdapter() {
	try {
		return neonSummarize(MODEL);
	} catch {
		return undefined;
	}
}
