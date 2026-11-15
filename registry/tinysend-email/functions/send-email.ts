import { timingSafeEqual } from "node:crypto";

const TINYSEND_API = "https://api.tinysend.com/v1";
const MAX_BODY_BYTES = 512 * 1024;

type SendRequest = {
	from?: string;
	to: string;
	subject: string;
	text?: string;
	html?: string;
	reply_to?: string;
	tag?: string;
	metadata?: Record<string, string>;
};

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

		const body = await readJson(request);
		if (!body) return jsonError("Expected a JSON object", 400);

		const send = parseSend(body, process.env.TINYSEND_FROM);
		if (typeof send === "string") return jsonError(send, 400);

		// A retry with the same key returns the first send instead of sending twice.
		const idempotencyKey = request.headers.get("idempotency-key");
		const headers = {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
		};

		let response: Response;
		try {
			response = await fetch(`${TINYSEND_API}/emails`, {
				method: "POST",
				headers,
				body: JSON.stringify(send),
			});
		} catch {
			return jsonError("Tinysend could not be reached", 502);
		}

		const answer = await response.json().catch(() => null);
		if (!response.ok) return tinysendError(response.status, answer);

		const sent = answer as Record<string, unknown>;
		return Response.json({
			id: sent.id,
			status: sent.status,
			from: sent.from,
			to: sent.to,
			subject: sent.subject,
			created_at: sent.created_at,
		});
	},
};

function parseSend(body: Record<string, unknown>, defaultFrom: string | undefined): SendRequest | string {
	const { to, subject, text, html, reply_to, tag, metadata } = body;
	const from = body.from ?? defaultFrom;
	if (typeof to !== "string" || to.trim() === "") return "to is required";
	if (typeof subject !== "string" || subject.trim() === "") return "subject is required";
	if (typeof text !== "string" && typeof html !== "string") return "text or html is required";
	if (from !== undefined && typeof from !== "string") return "from must be a string";
	if (reply_to !== undefined && typeof reply_to !== "string") return "reply_to must be a string";
	if (tag !== undefined && typeof tag !== "string") return "tag must be a string";
	if (metadata !== undefined && !isRecord(metadata)) return "metadata must be an object";

	const send: SendRequest = { to, subject };
	if (from) send.from = from;
	if (typeof text === "string") send.text = text;
	if (typeof html === "string") send.html = html;
	if (reply_to) send.reply_to = reply_to;
	if (tag) send.tag = tag;
	if (metadata) send.metadata = metadata as Record<string, string>;
	return send;
}

function tinysendError(status: number, answer: unknown): Response {
	const message = errorMessage(answer) ?? "Tinysend request failed";
	// A rejected API key is the function's problem, not the caller's.
	if (status === 401 || status === 403) {
		return jsonError("Tinysend rejected the API key", 502);
	}
	// 402 is a plan limit, 422 a sender or recipient Tinysend refused: the caller can act on both.
	if (status >= 400 && status < 500) return jsonError(message, status);
	return jsonError(message, 502);
}

function errorMessage(answer: unknown): string | null {
	if (!isRecord(answer)) return null;
	const error = answer.error;
	if (typeof error === "string") return error;
	if (isRecord(error) && typeof error.message === "string") return error.message;
	return null;
}

function isAuthorized(request: Request, expectedToken: string): boolean {
	const providedToken = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
	const expectedBytes = Buffer.from(expectedToken);
	const providedBytes = Buffer.from(providedToken);
	return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) return null;
	try {
		const body: unknown = JSON.parse(text);
		return isRecord(body) ? body : null;
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonError(message: string, status: number): Response {
	return Response.json({ error: message }, { status });
}
