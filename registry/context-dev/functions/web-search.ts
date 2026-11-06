import { timingSafeEqual } from "node:crypto";
import ContextDev from "context.dev";

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
		}

		const apiKey = process.env.CONTEXT_DEV_API_KEY;
		const expectedToken = process.env.CONTEXT_FUNCTION_TOKEN;
		if (!apiKey || !expectedToken || expectedToken.length < 32) {
			return Response.json(
				{ error: "Context.dev function is not configured" },
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
		const { query, numResults = 10 } = body as Record<string, unknown>;
		const isValidQuery =
			typeof query === "string" &&
			query.trim().length > 0 &&
			query.length <= 500;
		const isValidCount =
			Number.isInteger(numResults) &&
			(numResults as number) >= 1 &&
			(numResults as number) <= 10;
		if (!isValidQuery || !isValidCount) {
			return Response.json(
				{ error: "Provide query (1-500 characters) and numResults (1-10)" },
				{ status: 400 },
			);
		}

		try {
			const client = new ContextDev({ apiKey, timeout: 60_000, maxRetries: 0 });
			const result = await client.web.search({
				query: query as string,
				numResults: numResults as number,
			});
			return Response.json(result);
		} catch (error) {
			return getErrorResponse(error);
		}
	},
};

function getErrorResponse(error: unknown): Response {
	if (!(error instanceof ContextDev.APIError)) {
		return Response.json(
			{ error: "Context.dev request failed" },
			{ status: 502 },
		);
	}

	const details = error.error as
		| { error_code?: string; request_id?: string }
		| undefined;
	const upstreamStatus =
		error.status && error.status >= 400 && error.status <= 599
			? error.status
			: 502;
	const status = upstreamStatus === 401 ? 502 : upstreamStatus;
	const message =
		upstreamStatus === 401
			? "Context.dev API key was rejected"
			: status === 402
				? "Context.dev credits exhausted"
				: status === 429
					? "Context.dev rate limit reached"
					: "Context.dev request failed";
	return Response.json(
		{
			error: message,
			error_code: details?.error_code,
			request_id: details?.request_id,
		},
		{ status },
	);
}
