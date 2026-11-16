import {
	Gemini,
	GOOGLE_SEARCH,
	InMemoryRunner,
	LlmAgent,
	type GeminiParams,
} from "@google/adk";

const MODEL = "gemini-3-flash";
const APP_NAME = "fact_checker";
const VERDICTS = ["TRUE", "FALSE", "MISLEADING", "UNVERIFIABLE"] as const;

type Verdict = (typeof VERDICTS)[number];

class GatewayGemini extends Gemini {
	constructor(
		private readonly gatewayBaseUrl: string,
		params: GeminiParams,
	) {
		super(params);
	}

	protected override getHttpOptions() {
		return {
			...super.getHttpOptions(),
			baseUrl: `${this.gatewayBaseUrl}/gemini`,
			apiVersion: "v1beta",
		};
	}
}

const INSTRUCTION = `You verify claims for a fact-checking API.

Search Google before answering, then reply in two parts:
- A first line holding only one verdict: TRUE, FALSE, MISLEADING, or UNVERIFIABLE.
- Two or three sentences explaining what the sources say, including any important date or figure.

Base the verdict only on the search results, and don't number or bullet the parts. If the results don't settle the claim, answer UNVERIFIABLE and say what is missing.`;

function createRunner(): InMemoryRunner | undefined {
	const token = process.env.NEON_AI_GATEWAY_TOKEN;
	const baseUrl = process.env.NEON_AI_GATEWAY_BASE_URL;
	if (!token || !baseUrl) return undefined;

	const agent = new LlmAgent({
		name: APP_NAME,
		description: "Verifies claims against Google Search results.",
		instruction: INSTRUCTION,
		model: new GatewayGemini(baseUrl, {
			model: MODEL,
			// The gateway reads the Authorization header. The SDK still requires
			// an API key. Use a placeholder; the gateway ignores it.
			apiKey: "placeholder",
			headers: { Authorization: `Bearer ${token}` },
		}),
		tools: [GOOGLE_SEARCH],
	});

	return new InMemoryRunner({ agent, appName: APP_NAME });
}

type Source = { title?: string; uri?: string };

type SearchEntryPoint = {
	renderedContent?: string;
	sdkBlob?: string;
};

type FactCheck = {
	reply: string;
	verdict?: Verdict;
	queries: string[];
	sources: Source[];
	searchEntryPoint?: SearchEntryPoint;
};

function readVerdict(reply: string): Verdict | undefined {
	const firstLine = (reply.split("\n")[0] ?? "")
		.replace(/[*_`#]/g, "")
		.trim()
		.toUpperCase();
	return VERDICTS.find((verdict) => verdict === firstLine);
}

async function factCheck(
	runner: InMemoryRunner,
	claim: string,
): Promise<FactCheck> {
	let reply = "";
	let searchEntryPoint: SearchEntryPoint | undefined;
	const queries = new Set<string>();
	const sources = new Map<string, Source>();

	const events = runner.runEphemeral({
		userId: "api",
		newMessage: { role: "user", parts: [{ text: claim }] },
	});

	for await (const event of events) {
		if (event.errorCode) {
			throw new Error(event.errorMessage ?? event.errorCode);
		}

		const text = (event.content?.parts ?? [])
			.map((part) => part.text ?? "")
			.join("");
		if (event.content?.role === "model" && text) {
			reply = text;
		}

		const metadata = event.groundingMetadata;
		for (const query of metadata?.webSearchQueries ?? []) queries.add(query);
		for (const chunk of metadata?.groundingChunks ?? []) {
			if (chunk.web?.uri) {
				sources.set(chunk.web.uri, {
					title: chunk.web.title,
					uri: chunk.web.uri,
				});
			}
		}
		const entryPoint = metadata?.searchEntryPoint;
		if (entryPoint?.renderedContent || entryPoint?.sdkBlob) {
			searchEntryPoint = entryPoint;
		}
	}

	if (!reply) throw new Error("The agent returned no answer");

	return {
		reply,
		verdict: readVerdict(reply),
		queries: [...queries],
		sources: [...sources.values()],
		searchEntryPoint,
	};
}

function failureResponse(error: unknown): Response {
	const status = (error as { status?: unknown } | null)?.status;

	if (status === 429) {
		return Response.json(
			{ error: "AI Gateway rate limit reached" },
			{ status: 429 },
		);
	}
	if (status === 401 || status === 403) {
		return Response.json(
			{ error: "AI Gateway rejected the credentials" },
			{ status: 502 },
		);
	}

	console.error("[fact-check] failed:", error);
	return Response.json({ error: "Fact check failed" }, { status: 502 });
}

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
		}

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return Response.json({ error: "Expected a JSON body" }, { status: 400 });
		}
		const claim =
			typeof body === "object" && body !== null
				? (body as { claim?: unknown }).claim
				: undefined;
		if (
			typeof claim !== "string" ||
			claim.trim().length === 0 ||
			claim.length > 2_000
		) {
			return Response.json(
				{ error: "Provide a claim of 1-2000 characters" },
				{ status: 400 },
			);
		}

		try {
			const runner = createRunner();
			if (!runner) {
				return Response.json(
					{
						error:
							"AI Gateway is not enabled. Run `neon config add ai-gateway`, then `neon deploy`.",
					},
					{ status: 503 },
				);
			}

			const result = await factCheck(runner, claim);
			return Response.json({ ...result, model: MODEL });
		} catch (error) {
			return failureResponse(error);
		}
	},
};
