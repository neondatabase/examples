import { timingSafeEqual } from "node:crypto";

const AUTOSEND_API = "https://api.autosend.com/v1";
const MAX_BODY_BYTES = 100_000;
const EVENT_NAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonError(message: string, status: number, code?: string): Response {
	return Response.json(code ? { error: message, code } : { error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAuthorized(request: Request, expected: string): boolean {
	const header = request.headers.get("authorization");
	if (!header?.startsWith("Bearer ")) return false;
	const provided = Buffer.from(header.slice("Bearer ".length));
	const secret = Buffer.from(expected);
	return provided.length === secret.length && timingSafeEqual(provided, secret);
}

function isFlatRecord(value: unknown): value is Record<string, string | number | boolean> {
	return (
		isRecord(value) &&
		Object.values(value).every((v) => ["string", "number", "boolean"].includes(typeof v))
	);
}

async function readJson(request: Request): Promise<Record<string, unknown> | Response> {
	const tooLarge = jsonError(`Body must be at most ${MAX_BODY_BYTES} bytes`, 413);
	if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return tooLarge;
	const text = await request.text();
	if (Buffer.byteLength(text) > MAX_BODY_BYTES) return tooLarge;
	try {
		const body: unknown = JSON.parse(text);
		return isRecord(body) ? body : jsonError("Send a JSON object body", 400);
	} catch {
		return jsonError("Send a JSON object body", 400);
	}
}

async function autosendError(response: Response): Promise<Response> {
	const body = (await response.json().catch(() => null)) as
		| { error?: { message?: string; code?: string } }
		| null;
	const message = body?.error?.message ?? `AutoSend returned ${response.status}`;
	const code = body?.error?.code;
	console.error(`[autosend-email] ${response.status} ${code ?? ""}: ${message}`);

	if (response.status === 400 || response.status === 404) return jsonError(message, 422, code);
	if (response.status === 429) {
		const retryAfter = response.headers.get("retry-after");
		return Response.json(
			{ error: message, code },
			{ status: 429, headers: retryAfter ? { "retry-after": retryAfter } : {} },
		);
	}
	return jsonError(message, 502, code);
}

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") return jsonError("Use POST", 405);

		const token = process.env.AUTOSEND_FUNCTION_TOKEN;
		const apiKey = process.env.AUTOSEND_API_KEY;
		if (!token || token.length < 32 || !apiKey) {
			return jsonError(
				"Set AUTOSEND_API_KEY and an AUTOSEND_FUNCTION_TOKEN of at least 32 characters",
				503,
			);
		}
		if (!isAuthorized(request, token)) return jsonError("Unauthorized", 401);

		const body = await readJson(request);
		if (body instanceof Response) return body;

		const { email, contactId, eventName, eventProperties } = body;
		if (email !== undefined && (typeof email !== "string" || !EMAIL_PATTERN.test(email))) {
			return jsonError("email must be an email address", 400);
		}
		if (contactId !== undefined && (typeof contactId !== "string" || contactId === "")) {
			return jsonError("contactId must be a non-empty string", 400);
		}
		if (email === undefined && contactId === undefined) {
			return jsonError("Send email, contactId, or both", 400);
		}
		if (typeof eventName !== "string" || !EVENT_NAME_PATTERN.test(eventName)) {
			return jsonError("eventName must be 1-64 letters, digits, or underscores", 400);
		}
		if (eventProperties !== undefined && !isFlatRecord(eventProperties)) {
			return jsonError("eventProperties must be an object of strings, numbers, and booleans", 400);
		}

		let response: Response;
		try {
			response = await fetch(`${AUTOSEND_API}/events/send`, {
				method: "POST",
				headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
				body: JSON.stringify({
					eventName,
					...(email !== undefined ? { email } : {}),
					...(contactId !== undefined ? { contactId } : {}),
					...(eventProperties !== undefined ? { eventProperties } : {}),
				}),
			});
		} catch (error) {
			console.error("[autosend-email] request failed:", error);
			return jsonError("Could not reach AutoSend", 502);
		}
		if (!response.ok) return autosendError(response);

		const result = (await response.json()) as { data?: { id?: string; contactId?: string } };
		return Response.json(
			{ eventId: result.data?.id ?? null, contactId: result.data?.contactId ?? null },
			{ status: 200 },
		);
	},
};
