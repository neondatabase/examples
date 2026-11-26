import { timingSafeEqual } from "node:crypto";
import { APIError, LoopsClient } from "loops";

const MAX_BODY_BYTES = 100_000;
const EVENT_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Scalar = string | number | boolean;

let client: LoopsClient | undefined;

function getClient(apiKey: string): LoopsClient {
	client ??= new LoopsClient(apiKey);
	return client;
}

function jsonError(message: string, status: number): Response {
	return Response.json({ error: message }, { status });
}

function isAuthorized(request: Request, expected: string): boolean {
	const header = request.headers.get("authorization");
	if (!header?.startsWith("Bearer ")) return false;
	const provided = Buffer.from(header.slice("Bearer ".length));
	const secret = Buffer.from(expected);
	return provided.length === secret.length && timingSafeEqual(provided, secret);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFlatRecord(value: unknown): value is Record<string, Scalar> {
	return (
		isRecord(value) &&
		Object.values(value).every((v) => ["string", "number", "boolean"].includes(typeof v))
	);
}

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") return jsonError("Use POST", 405);

		const token = process.env.LOOPS_FUNCTION_TOKEN;
		const apiKey = process.env.LOOPS_API_KEY;
		if (!token || token.length < 32 || !apiKey) {
			return jsonError("Set LOOPS_API_KEY and a LOOPS_FUNCTION_TOKEN of at least 32 characters", 503);
		}
		if (!isAuthorized(request, token)) return jsonError("Unauthorized", 401);

		const tooLarge = jsonError(`Body must be at most ${MAX_BODY_BYTES} bytes`, 413);
		if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return tooLarge;
		const text = await request.text();
		if (Buffer.byteLength(text) > MAX_BODY_BYTES) return tooLarge;

		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {
			return jsonError("Send a JSON object body", 400);
		}
		if (!isRecord(body)) return jsonError("Send a JSON object body", 400);

		const { email, userId, eventName, eventProperties, contactProperties } = body;
		if (email !== undefined && (typeof email !== "string" || !EMAIL_PATTERN.test(email))) {
			return jsonError("email must be an email address", 400);
		}
		if (userId !== undefined && (typeof userId !== "string" || userId === "")) {
			return jsonError("userId must be a non-empty string", 400);
		}
		if (email === undefined && userId === undefined) {
			return jsonError("Provide email, userId, or both", 400);
		}
		if (typeof eventName !== "string" || !EVENT_NAME_PATTERN.test(eventName)) {
			return jsonError("eventName must be 1-100 letters, digits, dots, dashes, or underscores", 400);
		}
		if (eventProperties !== undefined && !isFlatRecord(eventProperties)) {
			return jsonError("eventProperties must be an object of strings, numbers, and booleans", 400);
		}
		if (contactProperties !== undefined && !isFlatRecord(contactProperties)) {
			return jsonError("contactProperties must be an object of strings, numbers, and booleans", 400);
		}

		const idempotencyKey = request.headers.get("idempotency-key");
		if (idempotencyKey !== null && (idempotencyKey === "" || idempotencyKey.length > 100)) {
			return jsonError("Idempotency-Key must be 1-100 characters", 400);
		}

		try {
			await getClient(apiKey).sendEvent({
				email: email as string | undefined,
				userId: userId as string | undefined,
				eventName,
				eventProperties: eventProperties as Record<string, Scalar> | undefined,
				contactProperties: contactProperties as Record<string, Scalar> | undefined,
				...(idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {}),
			});
			return Response.json({ sent: true }, { status: 200 });
		} catch (error) {
			if (idempotencyKey && error instanceof APIError && error.statusCode === 409) {
				return jsonError("This Idempotency-Key was already used in the last 24 hours", 409);
			}
			if (error instanceof APIError && error.statusCode >= 400 && error.statusCode < 500) {
				console.error("[loops-email] Loops rejected the event:", error.message);
				return jsonError(error.message, 422);
			}
			console.error("[loops-email] send-event failed:", error);
			return jsonError("Could not send the event to Loops", 502);
		}
	},
};
