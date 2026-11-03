import {
	Agent,
	OpenAIProvider,
	Runner,
	setTracingDisabled,
	tool,
	type AgentInputItem,
} from "@openai/agents";
import { z } from "zod";

// The SDK exports traces to OpenAI with OPENAI_API_KEY; this template uses the gateway only.
setTracingDisabled(true);

const MODEL = "gpt-5-mini";

const rollDice = tool({
	name: "rollDice",
	description: "Roll one to ten six-sided dice and return the rolls and total.",
	parameters: z.object({
		count: z.number().int().min(1).max(10).describe("How many dice to roll"),
	}),
	execute: async ({ count }) =>
		JSON.stringify({
			rolls: Array.from(
				{ length: count },
				() => 1 + Math.floor(Math.random() * 6),
			),
		}),
});

const agent = new Agent({
	name: "assistant",
	instructions:
		"You are a concise assistant. Call rollDice when the user asks for dice rolls, then report the individual rolls and the total.",
	model: MODEL,
	tools: [rollDice],
});

type IncomingMessage = {
	role: "user" | "assistant" | "system";
	content: string;
};

function isIncomingMessage(message: unknown): message is IncomingMessage {
	if (!message || typeof message !== "object") return false;
	const { role, content } = message as Record<string, unknown>;
	return (
		(role === "user" || role === "assistant" || role === "system") &&
		typeof content === "string" &&
		content.trim().length > 0 &&
		content.length <= 20_000
	);
}

function toAgentInput(messages: IncomingMessage[]): AgentInputItem[] {
	return messages.map(({ role, content }) => {
		if (role === "assistant") {
			// Assistant history needs the SDK's output_text block shape.
			return {
				role: "assistant",
				status: "completed",
				content: [{ type: "output_text", text: content }],
			};
		}
		if (role === "system") return { role: "system", content };
		return { role: "user", content };
	});
}

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
		const { messages } = input;
		if (
			!Array.isArray(messages) ||
			messages.length === 0 ||
			messages.length > 50 ||
			!messages.every(isIncomingMessage) ||
			!messages.some((message) => message.role === "user")
		) {
			return errorResponse(
				"Provide 1-50 messages with a role (user, assistant, system) and 1-20000 character content, including at least one user message",
				400,
			);
		}

		try {
			const result = await runner.run(agent, toAgentInput(messages), {
				stream: true,
				maxTurns: 8,
			});

			void result.completed.catch((error) => {
				console.error("OpenAI Agents chat stream failed", error);
			});

			const textStream = result.toTextStream();
			const encoder = new TextEncoder();
			const stream = new ReadableStream<Uint8Array>({
				async start(controller) {
					try {
						for await (const chunk of textStream) {
							controller.enqueue(encoder.encode(chunk));
						}
						controller.close();
					} catch (error) {
						controller.error(error);
					}
				},
			});

			return new Response(stream, {
				headers: {
					"content-type": "text/plain; charset=utf-8",
					"cache-control": "no-store",
				},
			});
		} catch (error) {
			console.error("OpenAI Agents chat failed", error);
			return errorResponse("Chat request failed", 502);
		}
	},
};
