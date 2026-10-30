import { timingSafeEqual } from "node:crypto";
import { summarize } from "@tanstack/ai";
import { neonSummarize } from "@tanstack/ai-neon";

// Any text model in the AI Gateway catalog: https://neon.com/docs/ai-gateway/models
const MODEL = "claude-haiku-5-5";

const STYLES = ["paragraph", "bullet-points", "concise"] as const;

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
		// maxLength is the token budget the prompt asks the model to stay under.
		const {
			text,
			style = "paragraph",
			maxLength = 300,
		} = body as Record<string, unknown>;
		const isValidText =
			typeof text === "string" &&
			text.trim().length > 0 &&
			text.length <= 50_000;
		const isValidStyle = STYLES.includes(style as (typeof STYLES)[number]);
		const isValidLength =
			Number.isInteger(maxLength) &&
			(maxLength as number) >= 100 &&
			(maxLength as number) <= 2000;
		if (!isValidText || !isValidStyle || !isValidLength) {
			return Response.json(
				{
					error:
						"Provide text (1-50000 characters), style (paragraph, bullet-points, or concise), and maxLength (100-2000 tokens)",
				},
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
			const result = await summarize({
				adapter,
				text: text as string,
				style: style as (typeof STYLES)[number],
				maxLength: maxLength as number,
				// On its own, maxLength is also the hard output cap, and models often
				// run a little over the budget in the prompt, which cuts the summary
				// off. Leave headroom so a slightly long summary still finishes.
				modelOptions: { max_tokens: (maxLength as number) * 2 },
				threadId: crypto.randomUUID(),
			});
			return Response.json({
				summary: result.summary,
				model: MODEL,
				usage: result.usage,
			});
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
					: code === "max_tokens"
						? "The summary was cut off at the output limit; raise maxLength"
						: "Model request failed",
		},
		{ status: 502 },
	);
}

// Reads NEON_AI_GATEWAY_BASE_URL and NEON_AI_GATEWAY_TOKEN, which Neon injects
// when aiGateway is enabled in neon.ts. Throws when either is missing.
function createAdapter() {
	try {
		return neonSummarize(MODEL);
	} catch {
		return undefined;
	}
}
