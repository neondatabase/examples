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
		const { task, mode = "fast" } = body as Record<string, unknown>;
		const isValidTask =
			typeof task === "string" && task.trim().length > 0 && task.length <= 2000;
		const isValidMode = mode === "fast" || mode === "ultra";
		if (!isValidTask || !isValidMode) {
			return Response.json(
				{
					error: "Provide a task of 1-2000 characters and mode (fast or ultra)",
				},
				{ status: 400 },
			);
		}

		try {
			const client = new ContextDev({
				apiKey,
				timeout: 120_000,
				maxRetries: 0,
			});
			const result = await client.web.answers({
				task: task as string,
				mode: mode as "fast" | "ultra",
				json_format: { answer: "" },
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
	const status =
		error.status && error.status >= 400 && error.status <= 599
			? error.status
			: 502;
	const message =
		status === 401
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
