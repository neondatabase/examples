import { timingSafeEqual } from "node:crypto";
import { Notra, NotraAPIError } from "@usenotra/sdk";
import { z } from "zod";

const Config = z.object({
	apiKey: z.string().min(1),
	expectedToken: z.string().min(32),
});

const CompetitorShareRequest = z.object({
	projectId: z.string().regex(/^[\w-]{1,100}$/),
	days: z.number().int().min(1).max(365).default(30),
});

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
		}

		const config = Config.safeParse({
			apiKey: process.env.NOTRA_API_KEY,
			expectedToken: process.env.NOTRA_FUNCTION_TOKEN,
		});
		if (!config.success) {
			return Response.json(
				{ error: "Notra function is not configured" },
				{ status: 503 },
			);
		}
		const { apiKey, expectedToken } = config.data;

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

		const parsed = CompetitorShareRequest.safeParse(input);
		if (!parsed.success) {
			return Response.json(
				{ error: "Provide a projectId and days (1-365)" },
				{ status: 400 },
			);
		}
		const { projectId, days } = parsed.data;

		try {
			const notra = new Notra({ apiKey, timeoutMs: 30_000, maxRetries: 0 });
			const { organization: _organization, ...share } =
				await notra.geo.getGeoVisibilityCompetitorShare({ projectId, days });
			return Response.json(share);
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
