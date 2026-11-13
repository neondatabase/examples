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

		let input: unknown;
		try {
			input = await request.json();
		} catch {
			return Response.json({ error: "Expected a JSON body" }, { status: 400 });
		}

		const body =
			input && typeof input === "object" && !Array.isArray(input) ? input : {};
		const { projectId, days = 30 } = body as Record<string, unknown>;
		const isValidDays =
			Number.isInteger(days) &&
			(days as number) >= 1 &&
			(days as number) <= 365;
		if (!isId(projectId) || !isValidDays) {
			return Response.json(
				{ error: "Provide a projectId and days (1-365)" },
				{ status: 400 },
			);
		}

		try {
			const notra = new Notra({ apiKey, timeoutMs: 30_000, maxRetries: 0 });
			const { configured, engines } = await notra.geo.getGeoVisibilityOverview({
				projectId,
				days: days as number,
			});
			return Response.json({ configured, engines });
		} catch (error) {
			return getErrorResponse(error);
		}
	},
};

function isId(value: unknown): value is string {
	return typeof value === "string" && /^[\w-]{1,100}$/.test(value);
}

function getErrorResponse(error: unknown): Response {
	if (!(error instanceof NotraAPIError)) {
		return Response.json({ error: "Notra request failed" }, { status: 502 });
	}

	const message =
		error.status === 401
			? "Notra API key was rejected"
			: error.status === 403
				? "Notra API key lacks the visibility.read scope"
				: error.status === 404
					? "Project not found"
					: error.status === 429
						? "Notra rate limit reached"
						: "Notra request failed";
	const status =
		error.status === 401 || error.status === 403 || error.status >= 500
			? 502
			: error.status;
	return Response.json(
		{ error: message, code: error.code, requestId: error.requestId },
		{ status },
	);
}
