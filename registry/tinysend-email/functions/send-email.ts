import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

const TINYSEND_API = "https://api.tinysend.com/v1";
const MAX_BODY_BYTES = 512 * 1024;

const SendRequest = z
	.object({
		from: z.email().optional(),
		to: z.email(),
		subject: z.string().trim().min(1).max(998),
		text: z.string().optional(),
		html: z.string().optional(),
		reply_to: z.email().optional(),
		tag: z.string().max(120).optional(),
		metadata: z.record(z.string(), z.string()).optional(),
	})
	.refine((send) => send.text !== undefined || send.html !== undefined, {
		error: "text or html is required",
	});

const TinysendEmail = z.object({
	id: z.string(),
	status: z.string(),
	from: z.string(),
	to: z.string(),
	subject: z.string().nullable(),
	created_at: z.string().nullable(),
});

const TinysendError = z.object({
	error: z.object({ message: z.string() }),
});

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
		}

		const apiKey = process.env.TINYSEND_API_KEY;
		const expectedToken = process.env.TINYSEND_FUNCTION_TOKEN;
		if (!apiKey || !expectedToken || expectedToken.length < 32) {
			return jsonError("Tinysend function is not configured", 503);
		}
		if (!isAuthorized(request, expectedToken)) {
			return jsonError("Unauthorized", 401);
		}

		const text = await request.text();
		if (text.length > MAX_BODY_BYTES) {
			return jsonError(`Body must be at most ${MAX_BODY_BYTES} bytes`, 413);
		}

		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {
			return jsonError("Expected a JSON object", 400);
		}

		const parsed = SendRequest.safeParse(body);
		if (!parsed.success) return jsonError(formatIssues(parsed.error), 400);

		const send = { ...parsed.data, from: parsed.data.from ?? (process.env.TINYSEND_FROM || undefined) };
		const idempotencyKey = request.headers.get("idempotency-key");

		let response: Response;
		try {
			response = await fetch(`${TINYSEND_API}/emails`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
					...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
				},
				body: JSON.stringify(send),
			});
		} catch {
			return jsonError("Tinysend could not be reached", 502);
		}

		const answer: unknown = await response.json().catch(() => null);
		if (!response.ok) return tinysendError(response.status, answer);

		const sent = TinysendEmail.safeParse(answer);
		if (!sent.success) return jsonError("Tinysend returned an unexpected response", 502);
		return Response.json(sent.data);
	},
};

function tinysendError(status: number, answer: unknown): Response {
	if (status === 401 || status === 403) {
		return jsonError("Tinysend rejected the API key", 502);
	}
	const message = TinysendError.safeParse(answer).data?.error.message ?? "Tinysend request failed";
	return jsonError(message, status >= 400 && status < 500 ? status : 502);
}

function formatIssues(error: z.ZodError): string {
	return error.issues
		.map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
		.join("; ");
}

function isAuthorized(request: Request, expectedToken: string): boolean {
	const providedToken = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
	const expectedBytes = Buffer.from(expectedToken);
	const providedBytes = Buffer.from(providedToken);
	return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
}

function jsonError(message: string, status: number): Response {
	return Response.json({ error: message }, { status });
}
