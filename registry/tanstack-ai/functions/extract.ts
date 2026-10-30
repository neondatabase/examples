import { timingSafeEqual } from "node:crypto";
import { chat } from "@tanstack/ai";
import { neonText } from "@tanstack/ai-neon";
import { z } from "zod";

// Any text model in the AI Gateway catalog: https://neon.com/docs/ai-gateway/models
const MODEL = "claude-haiku-5-5";

// The shape of every response. Change it to extract what your app needs.
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

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
		}

		const expectedToken = process.env.TANSTACK_AI_FUNCTION_TOKEN;
		if (!expectedToken || expectedToken.length < 32) {
			return Response.json(
				{ error: "TanStack AI function is not configured" },
				{ status: 503 },
			);
		}

		const providedToken =
			request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
		const expectedBytes = Buffer.from(expectedToken);
		const providedBytes = Buffer.from(providedToken);
		const isAuthorized =
			providedBytes.length === expectedBytes.length &&
			timingSafeEqual(providedBytes, expectedBytes);
		if (!isAuthorized) {
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		}

		let input: unknown;
		try {
			input = await request.json();
		} catch {
			return Response.json({ error: "Expected a JSON body" }, { status: 400 });
		}

		const body =
			input && typeof input === "object" && !Array.isArray(input) ? input : {};
		const { text } = body as Record<string, unknown>;
		const isValidText =
			typeof text === "string" &&
			text.trim().length > 0 &&
			text.length <= 20_000;
		if (!isValidText) {
			return Response.json(
				{ error: "Provide text of 1-20000 characters" },
				{ status: 400 },
			);
		}

		const adapter = createAdapter();
		if (!adapter) {
			return Response.json(
				{
					error:
						"AI Gateway is not enabled. Run `neon config add ai-gateway`, then `neon deploy --env .env.local`.",
				},
				{ status: 503 },
			);
		}

		try {
			// With outputSchema, chat() resolves to an object validated against it.
			const data = await chat({
				adapter,
				messages: [{ role: "user", content: text as string }],
				threadId: crypto.randomUUID(),
				systemPrompts: [
					"Extract structured data from the user's text. Use empty arrays for anything the text does not mention.",
				],
				outputSchema: ExtractionSchema,
			});
			return Response.json({ data, model: MODEL });
		} catch (error) {
			return getErrorResponse(error);
		}
	},
};

function getErrorResponse(error: unknown): Response {
	// TanStack AI rethrows gateway failures as an Error whose code is the HTTP
	// status as a string, for example "429".
	const code =
		error && typeof error === "object" && "code" in error
			? String(error.code)
			: undefined;
	if (code === "429") {
		return Response.json(
			{ error: "AI Gateway rate limit reached" },
			{ status: 429 },
		);
	}
	return Response.json(
		{
			error:
				code === "401" || code === "403"
					? "AI Gateway rejected the credentials"
					: "Model request failed",
		},
		{ status: 502 },
	);
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
