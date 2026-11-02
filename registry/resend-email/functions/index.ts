import { timingSafeEqual } from "node:crypto";
import { Resend } from "resend";

const MAX_BODY_BYTES = 500_000;
const MAX_RECIPIENTS = 50;
const MAX_SUBJECT_LENGTH = 200;
const MAX_CONTENT_LENGTH = 100_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let client: Resend | undefined;

function getClient(): Resend {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) throw new Error("RESEND_API_KEY is not set");
	client ??= new Resend(apiKey);
	return client;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonError(message: string, status: number): Response {
	return Response.json({ error: message }, { status });
}

// Neon Function URLs are public, so require a caller token on top of the
// Resend key. The token is compared in constant time.
function isAuthorized(request: Request): boolean {
	const expected = process.env.RESEND_FUNCTION_TOKEN;
	const header = request.headers.get("authorization");
	if (!expected || !header?.startsWith("Bearer ")) return false;

	const provided = Buffer.from(header.slice("Bearer ".length));
	const secret = Buffer.from(expected);
	return provided.length === secret.length && timingSafeEqual(provided, secret);
}

function isEmail(value: unknown): value is string {
	return typeof value === "string" && value.length <= 320 && EMAIL_PATTERN.test(value);
}

function normalizeRecipients(value: unknown): string[] | null {
	const list =
		typeof value === "string" ? [value] : Array.isArray(value) ? value : null;
	if (!list || list.length === 0 || list.length > MAX_RECIPIENTS) return null;
	if (!list.every(isEmail)) return null;
	return list;
}

type ParsedBody = { body: Record<string, unknown> } | { error: string; status: number };

async function readJson(request: Request): Promise<ParsedBody> {
	const declared = Number(request.headers.get("content-length") ?? "0");
	const tooLarge = { error: `Body must be at most ${MAX_BODY_BYTES} bytes`, status: 413 };
	if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return tooLarge;

	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) return tooLarge;

	try {
		const body: unknown = JSON.parse(text);
		return isRecord(body)
			? { body }
			: { error: "Send a JSON object body", status: 400 };
	} catch {
		return { error: "Send a JSON object body", status: 400 };
	}
}

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/") {
			return Response.json({
				name: "Send email with Resend",
				routes: ["POST /send  { to, subject, html?, text?, replyTo? }"],
				note: "Send Authorization: Bearer <RESEND_FUNCTION_TOKEN> with every request.",
			});
		}

		if (url.pathname !== "/send") {
			return jsonError("Not found", 404);
		}

		if (request.method !== "POST") {
			return jsonError("Use POST", 405);
		}

		if (!isAuthorized(request)) {
			return jsonError("Unauthorized", 401);
		}

		const parsed = await readJson(request);
		if ("error" in parsed) {
			return jsonError(parsed.error, parsed.status);
		}
		const body = parsed.body;

		const to = normalizeRecipients(body.to);
		if (!to) {
			return jsonError(`to must be 1-${MAX_RECIPIENTS} email addresses`, 400);
		}

		if (
			typeof body.subject !== "string" ||
			body.subject.trim().length === 0 ||
			body.subject.length > MAX_SUBJECT_LENGTH ||
			/[\r\n]/.test(body.subject)
		) {
			return jsonError(
				`subject must be 1-${MAX_SUBJECT_LENGTH} characters on one line`,
				400,
			);
		}

		const html = body.html;
		const text = body.text;
		if (
			(html !== undefined && typeof html !== "string") ||
			(text !== undefined && typeof text !== "string")
		) {
			return jsonError("Provide html, text, or both as strings", 400);
		}
		if (
			!(typeof html === "string" && html.length > 0) &&
			!(typeof text === "string" && text.length > 0)
		) {
			return jsonError("Provide non-empty html or text", 400);
		}
		if (
			(typeof html === "string" && html.length > MAX_CONTENT_LENGTH) ||
			(typeof text === "string" && text.length > MAX_CONTENT_LENGTH)
		) {
			return jsonError(`html and text must be at most ${MAX_CONTENT_LENGTH} characters`, 400);
		}

		if (body.replyTo !== undefined && !isEmail(body.replyTo)) {
			return jsonError("replyTo must be an email address", 400);
		}

		const from = process.env.RESEND_FROM;
		if (!from) {
			return jsonError("RESEND_FROM is not configured", 500);
		}

		try {
			const content =
				typeof html === "string" && typeof text === "string"
					? { html, text }
					: typeof html === "string"
						? { html }
						: { text: text as string };

			const { data, error } = await getClient().emails.send({
				from,
				to,
				subject: body.subject.trim(),
				...content,
				...(typeof body.replyTo === "string" ? { replyTo: body.replyTo } : {}),
			});

			if (error) {
				console.error("[resend-email] Resend rejected the message:", error);
				return Response.json(
					{ error: "Resend rejected the message", name: error.name },
					{ status: 502 },
				);
			}

			return Response.json({ id: data?.id ?? null }, { status: 200 });
		} catch (error) {
			console.error("[resend-email] send failed:", error);
			return jsonError("Could not send the email", 502);
		}
	},
};
