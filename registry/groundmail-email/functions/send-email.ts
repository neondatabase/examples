import { timingSafeEqual } from "node:crypto";
import { Groundmail, GroundmailError, type SendEmailParams } from "groundmail";

const MAX_BODY_BYTES = 512 * 1024;
const MAX_RECIPIENTS = 50;
const MAX_SUBJECT_LENGTH = 998;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let client: Groundmail | undefined;

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
		}

		const apiKey = process.env.GROUNDMAIL_API_KEY;
		const expectedToken = process.env.GROUNDMAIL_FUNCTION_TOKEN;
		if (!apiKey || !expectedToken || expectedToken.length < 32) {
			return jsonError("Groundmail function is not configured", 503);
		}
		if (!isAuthorized(request, expectedToken)) {
			return jsonError("Unauthorized", 401);
		}

		const raw = await request.text();
		if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
			return jsonError(`Body must be at most ${MAX_BODY_BYTES} bytes`, 413);
		}

		let body: unknown;
		try {
			body = JSON.parse(raw);
		} catch {
			return jsonError("Expected a JSON object", 400);
		}

		const parsed = parseSend(body);
		if ("error" in parsed) return jsonError(parsed.error, 400);

		const send: SendEmailParams = parsed.send;
		const from = send.from ?? (process.env.GROUNDMAIL_FROM || undefined);
		if (from) send.from = from;
		const idempotencyKey = request.headers.get("idempotency-key");
		if (idempotencyKey) send.idempotencyKey = idempotencyKey;

		client ??= new Groundmail(apiKey);
		try {
			const email = await client.emails.send(send);
			return Response.json(email);
		} catch (error) {
			return groundmailError(error);
		}
	},
};

type Parsed = { send: SendEmailParams } | { error: string };

function parseSend(body: unknown): Parsed {
	if (!isRecord(body)) return { error: "Expected a JSON object" };

	const to = recipients(body.to);
	if (!to) return { error: `to: one email address or a list of up to ${MAX_RECIPIENTS}` };

	const send: SendEmailParams = { to };

	if (body.from !== undefined) {
		if (typeof body.from !== "string" || body.from.trim() === "") return { error: "from: expected a string" };
		send.from = body.from;
	}
	if (body.reply_to !== undefined) {
		const replyTo = recipients(body.reply_to);
		if (!replyTo) return { error: "reply_to: one email address or a list" };
		send.reply_to = replyTo;
	}

	if (body.template !== undefined) {
		const template = body.template;
		if (!isRecord(template) || typeof template.id !== "string" || template.id === "") {
			return { error: "template: expected { id, variables? }" };
		}
		if (template.variables !== undefined && !isVariables(template.variables)) {
			return { error: "template.variables: expected an object of strings, numbers or booleans" };
		}
		if (body.html !== undefined || body.text !== undefined) {
			return { error: "Send html/text or a template, not both" };
		}
		send.template = { id: template.id, variables: template.variables };
	} else {
		if (body.html !== undefined && typeof body.html !== "string") return { error: "html: expected a string" };
		if (body.text !== undefined && typeof body.text !== "string") return { error: "text: expected a string" };
		if (body.html === undefined && body.text === undefined) return { error: "html, text or template is required" };
		if (body.html !== undefined) send.html = body.html;
		if (body.text !== undefined) send.text = body.text;
	}

	if (body.subject !== undefined) {
		if (typeof body.subject !== "string" || body.subject.trim() === "" || body.subject.length > MAX_SUBJECT_LENGTH) {
			return { error: `subject: expected a string of 1 to ${MAX_SUBJECT_LENGTH} characters` };
		}
		send.subject = body.subject;
	} else if (send.template === undefined) {
		return { error: "subject is required unless the template supplies it" };
	}

	if (body.tags !== undefined) {
		if (!isRecord(body.tags) || !Object.values(body.tags).every((v) => typeof v === "string")) {
			return { error: "tags: expected an object of string values" };
		}
		send.tags = body.tags as Record<string, string>;
	}

	return { send };
}

function groundmailError(error: unknown): Response {
	if (!(error instanceof GroundmailError)) {
		return jsonError("Groundmail could not be reached", 502);
	}
	if (error.status === 401 || error.code === "insufficient_scope") {
		return Response.json({ error: "Groundmail rejected the API key", code: error.code }, { status: 502 });
	}
	const status = error.status >= 400 && error.status < 500 ? error.status : 502;
	return Response.json(
		{ error: error.message, code: error.code, hint: error.hint, docs_url: error.docsUrl },
		{ status },
	);
}

function recipients(value: unknown): string[] | null {
	const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : null;
	if (!list || list.length === 0 || list.length > MAX_RECIPIENTS) return null;
	return list.every(isEmail) ? list : null;
}

function isEmail(value: unknown): value is string {
	return typeof value === "string" && value.length <= 320 && EMAIL_PATTERN.test(value);
}

function isVariables(value: unknown): value is Record<string, string | number | boolean> {
	return (
		isRecord(value) &&
		Object.values(value).every((v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
