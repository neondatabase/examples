import {
	Agent,
	OpenAIProvider,
	Runner,
	setTracingDisabled,
} from "@openai/agents";

// The SDK exports traces to OpenAI with OPENAI_API_KEY; this template uses the gateway only.
setTracingDisabled(true);

const MODEL = "gpt-5-mini";

const billingAgent = new Agent({
	name: "billing",
	handoffDescription: "Handles charges, invoices, refunds, and subscriptions.",
	instructions:
		"You are a billing specialist. Answer billing questions concisely. If you need account details, ask for them once.",
	model: MODEL,
});

const technicalAgent = new Agent({
	name: "technical",
	handoffDescription: "Handles errors, outages, configuration, and API usage.",
	instructions:
		"You are a technical support specialist. Answer technical questions concisely and give one concrete next step.",
	model: MODEL,
});

const triageAgent = new Agent({
	name: "triage",
	instructions:
		"You triage support requests. Hand billing and payment questions to the billing agent and errors, outages, configuration, or API questions to the technical agent. Do not answer their questions yourself.",
	model: MODEL,
	handoffs: [billingAgent, technicalAgent],
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
		const { message } = input;
		if (
			typeof message !== "string" ||
			message.trim().length === 0 ||
			message.length > 20_000
		) {
			return errorResponse(
				"Provide a message of 1-20000 characters",
				400,
			);
		}

		try {
			const result = await runner.run(triageAgent, message, {
				maxTurns: 6,
			});
			return Response.json({
				agent: result.lastAgent?.name ?? "triage",
				reply: result.finalOutput,
			});
		} catch (error) {
			console.error("OpenAI Agents triage failed", error);
			return errorResponse("Triage request failed", 502);
		}
	},
};
