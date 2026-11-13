import { timingSafeEqual } from "node:crypto";
import { Notra, NotraAPIError } from "@usenotra/sdk";

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
		}

		const apiKey = process.env.NOTRA_API_KEY;
		const expectedToken = process.env.NOTRA_FUNCTION_TOKEN;
		if (!apiKey || !expectedToken || expectedToken.length < 32) {
			return Response.json(
				{ error: "Notra function is not configured" },
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

		try {
			const notra = new Notra({ apiKey, timeoutMs: 30_000, maxRetries: 0 });
			const { projects } = await notra.geo.listProjects();
			return Response.json({ projects });
		} catch (error) {
			return getErrorResponse(error);
		}
	},
};

const ERROR_MESSAGES: Record<number, string> = {
	401: "Notra rejected NOTRA_API_KEY",
	402: "Your Notra plan does not cover this request",
	403: "NOTRA_API_KEY is not allowed to make this request",
	404: "Not found in Notra",
	429: "Notra rate limit reached",
};

function getErrorResponse(error: unknown): Response {
	if (!(error instanceof NotraAPIError)) {
		return Response.json({ error: "Notra request failed" }, { status: 502 });
	}

	// A rejected key or Notra outage is this function's problem, not the caller's.
	const status =
		error.status === 401 || error.status === 403 || error.status >= 500
			? 502
			: error.status;
	return Response.json(
		{
			error: ERROR_MESSAGES[error.status] ?? "Notra request failed",
			detail: error.message,
			code: error.code,
			requestId: error.requestId,
		},
		{ status },
	);
}
