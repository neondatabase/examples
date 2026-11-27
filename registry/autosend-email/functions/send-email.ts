import { timingSafeEqual } from "node:crypto";

const AUTOSEND_API = "https://api.autosend.com/v1";
const MAX_BODY_BYTES = 500_000;
const MAX_SUBJECT_LENGTH = 998;
const MAX_CONTENT_LENGTH = 100_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Address = { email: string; name?: string };

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

function isEmail(value: unknown): value is string {
	return typeof value === "string" && value.length <= 320 && EMAIL_PATTERN.test(value);
}

function toAddress(value: unknown): Address | null {
	if (isRecord(value)) {
		if (!isEmail(value.email)) return null;
		if (value.name !== undefined && typeof value.name !== "string") return null;
		return value.name ? { email: value.email, name: value.name } : { email: value.email };
	}
	if (typeof value !== "string") return null;
	const match = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(value);
	const email = (match ? match[2] : value).trim();
	const name = match?.[1].replace(/^"|"$/g, "").trim();
	if (!isEmail(email)) return null;
	return name ? { email, name } : { email };
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

		const to = toAddress(body.to);
		if (!to) return jsonError("to must be an email address or { email, name }", 400);

		const from = toAddress(body.from ?? process.env.AUTOSEND_FROM);
		if (!from) {
			return jsonError("Set AUTOSEND_FROM or send from as an address on a verified domain", 400);
		}

		const { templateId, subject, html, text, dynamicData } = body;
		if (templateId !== undefined && (typeof templateId !== "string" || templateId === "")) {
			return jsonError("templateId must be a non-empty string", 400);
		}
		if (
			subject !== undefined &&
			(typeof subject !== "string" ||
				subject.trim() === "" ||
				subject.length > MAX_SUBJECT_LENGTH ||
				/[\r\n]/.test(subject))
		) {
			return jsonError(`subject must be 1-${MAX_SUBJECT_LENGTH} characters on one line`, 400);
		}
		for (const [name, value] of [
			["html", html],
			["text", text],
		] as const) {
			if (value !== undefined && (typeof value !== "string" || value.length > MAX_CONTENT_LENGTH)) {
				return jsonError(`${name} must be a string of at most ${MAX_CONTENT_LENGTH} characters`, 400);
			}
		}
		if (templateId === undefined) {
			if (subject === undefined) return jsonError("Send templateId, or subject with html or text", 400);
			if (!html && !text) return jsonError("Send html, text, or both with subject", 400);
		}
		if (dynamicData !== undefined && !isRecord(dynamicData)) {
			return jsonError("dynamicData must be an object", 400);
		}

		const replyTo = body.replyTo === undefined ? undefined : toAddress(body.replyTo);
		if (replyTo === null) return jsonError("replyTo must be an email address or { email, name }", 400);

		let response: Response;
		try {
			response = await fetch(`${AUTOSEND_API}/mails/send`, {
				method: "POST",
				headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
				body: JSON.stringify({
					to,
					from,
					...(templateId !== undefined ? { templateId } : {}),
					...(subject !== undefined ? { subject: subject.trim() } : {}),
					...(html ? { html } : {}),
					...(text ? { text } : {}),
					...(dynamicData !== undefined ? { dynamicData } : {}),
					...(replyTo ? { replyTo } : {}),
				}),
			});
		} catch (error) {
			console.error("[autosend-email] request failed:", error);
			return jsonError("Could not reach AutoSend", 502);
		}
		if (!response.ok) return autosendError(response);

		const result = (await response.json()) as { data?: { emailId?: string } };
		return Response.json({ emailId: result.data?.emailId ?? null }, { status: 200 });
	},
};
