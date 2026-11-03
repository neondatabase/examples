import {
	Agent,
	OpenAIProvider,
	Runner,
	setTracingDisabled,
} from "@openai/agents";
import { z } from "zod";

// The SDK exports traces to OpenAI with OPENAI_API_KEY; this template uses the gateway only.
setTracingDisabled(true);

const MODEL = "gpt-5-mini";

// Change this schema to extract the fields your app needs.
const ContactSchema = z.object({
	name: z.string().describe("The person's full name"),
	email: z.string().describe("The email address"),
	joinedAt: z
		.string()
		.describe("The join date as written in the text, or an empty string"),
});

const agent = new Agent({
	name: "extractor",
	instructions:
		"Extract the requested contact fields from the user's text. Use an empty string for anything the text does not mention.",
	model: MODEL,
	outputType: ContactSchema,
});

function createRunner(): Runner | undefined {
	const apiKey = process.env.NEON_AI_GATEWAY_TOKEN;
	const baseURL = process.env.NEON_AI_GATEWAY_BASE_URL;
	if (!apiKey || !baseURL) return undefined;

	const provider = new OpenAIProvider({
		apiKey,
		baseURL: `${baseURL}/v1`,
		useResponses: false,
	});
	return new Runner({ modelProvider: provider });
}

function errorResponse(error: string, status: number): Response {
	return Response.json({ error }, { status });
}

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
		}

		const runner = createRunner();
		if (!runner) {
			return errorResponse(
				"AI Gateway is not enabled. Run `neon config add ai-gateway`, then `neon deploy --env .env.local`.",
				503,
			);
		}

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return errorResponse("Expected a JSON body", 400);
		}
		const input =
			body && typeof body === "object" && !Array.isArray(body)
				? (body as Record<string, unknown>)
				: {};
		const { text } = input;
		if (
			typeof text !== "string" ||
			text.trim().length === 0 ||
			text.length > 20_000
		) {
			return errorResponse("Provide text of 1-20000 characters", 400);
		}

		try {
			const result = await runner.run(agent, text, { maxTurns: 3 });
			return Response.json({ data: result.finalOutput, model: MODEL });
		} catch (error) {
			console.error("OpenAI Agents extraction failed", error);
			return errorResponse("Extraction request failed", 502);
		}
	},
};
