import { timingSafeEqual } from "node:crypto";
import AIInbx, { APIError, type SendEmailRequest } from "aiinbx";

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
		}

		const apiKey = process.env.AI_INBX_API_KEY;
		const expectedToken = process.env.AI_INBX_FUNCTION_TOKEN;
		if (!apiKey || !expectedToken || expectedToken.length < 32) {
			return Response.json(
				{ error: "AI Inbx function is not configured" },
				{ status: 503 },
			);
		}

		if (!isAuthorized(request, expectedToken)) {
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		}

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return Response.json({ error: "Expected a JSON body" }, { status: 400 });
		}

		if (typeof body !== "object" || body === null || Array.isArray(body)) {
			return Response.json(
				{ error: "Expected a JSON object" },
				{ status: 400 },
			);
		}

		try {
			// The body is the send request. AI Inbx validates it, including that the
			// workspace may send from `from`, and the caller gets its errors back.
			const sent = await new AIInbx({ apiKey }).emails.send(
				body as SendEmailRequest,
				{
					// A retry with the same key returns the first email instead of sending it twice.
					idempotencyKey: request.headers.get("idempotency-key") ?? undefined,
				},
			);
			return Response.json({
				id: sent.id,
				thread_id: sent.thread_id,
				status: sent.status,
				scheduled_at: sent.scheduled_at,
				review_url: sent.draft?.review_url ?? null,
				suppressed: sent.suppressed,
				pacing: sent.pacing,
			});
		} catch (error) {
			return getErrorResponse(error);
		}
	},
};

function isAuthorized(request: Request, expectedToken: string): boolean {
	const providedToken =
		request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
	const expectedBytes = Buffer.from(expectedToken);
	const providedBytes = Buffer.from(providedToken);
	return (
		providedBytes.length === expectedBytes.length &&
		timingSafeEqual(providedBytes, expectedBytes)
	);
}

function getErrorResponse(error: unknown): Response {
	if (!(error instanceof APIError)) {
		return Response.json({ error: "AI Inbx request failed" }, { status: 502 });
	}

	// A rejected API key is the function's problem, not the caller's.
	const status =
		error.status === 401 || error.status === 403 ? 502 : error.status;
	return Response.json(
		{
			error: error.message,
			code: error.code,
			issues: error.issues,
			request_id: error.requestId,
		},
		{ status },
	);
}
