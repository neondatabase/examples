import crypto from "node:crypto";
import { LoopsClient } from "loops";

const TEMPLATES: Record<string, { env: string; variable: string }> = {
	"send.otp:sign-in": { env: "LOOPS_OTP_SIGNIN_TRANSACTIONAL_ID", variable: "otpCode" },
	"send.otp:email-verification": {
		env: "LOOPS_OTP_VERIFICATION_TRANSACTIONAL_ID",
		variable: "otpCode",
	},
	"send.otp:forget-password": {
		env: "LOOPS_OTP_PASSWORD_RESET_TRANSACTIONAL_ID",
		variable: "otpCode",
	},
	"send.magic_link:sign-in": {
		env: "LOOPS_MAGIC_LINK_TRANSACTIONAL_ID",
		variable: "magicLinkUrl",
	},
	"send.magic_link:email-verification": {
		env: "LOOPS_VERIFY_EMAIL_TRANSACTIONAL_ID",
		variable: "verificationUrl",
	},
	"send.magic_link:forget-password": {
		env: "LOOPS_RESET_PASSWORD_TRANSACTIONAL_ID",
		variable: "resetPasswordUrl",
	},
};

const MAX_AGE_MS = 5 * 60 * 1000;
const KEY_REFRESH_MS = 30 * 1000;
const MAX_SENT_EVENTS = 1000;

type NeonAuthEvent = {
	event_id: string;
	event_type: string;
	user: { id?: string; email: string; name?: string | null };
	event_data: {
		otp_code?: string;
		otp_type?: string;
		delivery_preference?: string;
		link_url?: string;
		link_type?: string;
		organization_name?: string;
		role?: string;
	};
};

type SigningKey = crypto.JsonWebKey & { kid: string };

class KeysUnavailable extends Error {}

let client: LoopsClient | undefined;
let signingKeys: SigningKey[] = [];
let keysFetchedAt = 0;
const sentEvents = new Set<string>();

function getClient(apiKey: string): LoopsClient {
	client ??= new LoopsClient(apiKey);
	return client;
}

async function fetchSigningKeys(url: string): Promise<SigningKey[]> {
	try {
		const res = await fetch(url);
		const { keys } = (await res.json()) as { keys?: SigningKey[] };
		if (res.ok && Array.isArray(keys)) return keys;
	} catch {}
	throw new KeysUnavailable("Could not fetch the Managed Better Auth signing keys");
}

async function getSigningKey(kid: string, jwksUrl: string): Promise<crypto.KeyObject> {
	let jwk = signingKeys.find((key) => key.kid === kid);
	if (!jwk && Date.now() - keysFetchedAt > KEY_REFRESH_MS) {
		signingKeys = await fetchSigningKeys(jwksUrl);
		keysFetchedAt = Date.now();
		jwk = signingKeys.find((key) => key.kid === kid);
	}
	if (!jwk) throw new Error(`Signing key ${kid} not found`);
	return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

async function verifyWebhook(
	rawBody: string,
	headers: Headers,
	jwksUrl: string,
): Promise<NeonAuthEvent> {
	const header = (name: string) =>
		headers.get(`neon-better-auth-${name}`) ?? headers.get(`x-neon-${name}`);
	const signature = header("signature");
	const kid = header("signature-kid");
	const timestamp = header("timestamp");
	if (!signature || !kid || !timestamp) throw new Error("Missing Neon signature headers");

	const age = Date.now() - Number(timestamp);
	if (!Number.isFinite(age) || age > MAX_AGE_MS) throw new Error("Webhook timestamp too old");

	const [jwsHeader, emptyPayload, jwsSignature] = signature.split(".");
	if (emptyPayload !== "" || !jwsSignature) throw new Error("Expected a detached JWS signature");
	const body = Buffer.from(rawBody).toString("base64url");
	const payload = Buffer.from(`${timestamp}.${body}`).toString("base64url");

	const valid = crypto.verify(
		null,
		Buffer.from(`${jwsHeader}.${payload}`),
		await getSigningKey(kid, jwksUrl),
		Buffer.from(jwsSignature, "base64url"),
	);
	if (!valid) throw new Error("Invalid webhook signature");

	return JSON.parse(rawBody) as NeonAuthEvent;
}

function fail(status: number, message: string): Response {
	console.error(`[loops-email] ${status}: ${message}`);
	return Response.json({ error: message }, { status });
}

function markSent(eventId: string) {
	sentEvents.add(eventId);
	if (sentEvents.size > MAX_SENT_EVENTS) sentEvents.delete(sentEvents.values().next().value!);
}

async function handle(event: NeonAuthEvent, loops: LoopsClient): Promise<Response> {
	const { event_type, event_data, user } = event;

	if (event_type === "user.created") {
		const [firstName, ...rest] = (user.name ?? "").trim().split(/\s+/);
		const lastName = rest.join(" ");
		const properties: Record<string, string> = {};
		if (firstName) properties.firstName = firstName;
		if (lastName) properties.lastName = lastName;
		await loops.updateContact({ email: user.email, userId: user.id, properties });
		return new Response(null, { status: 200 });
	}

	if (event_type === "organization.invitation.accepted") {
		await loops.sendEvent({
			email: user.email,
			userId: user.id,
			eventName: "joinedOrganization",
			eventProperties: {
				organizationName: event_data.organization_name ?? "",
				role: event_data.role ?? "",
			},
		});
		return new Response(null, { status: 200 });
	}

	if (event_type !== "send.otp" && event_type !== "send.magic_link") {
		return Response.json({ ignored: event_type }, { status: 200 });
	}

	const isOtp = event_type === "send.otp";
	if (isOtp && event_data.delivery_preference === "sms") {
		return fail(422, "SMS codes aren't sent through Loops");
	}

	const type = isOtp ? event_data.otp_type : event_data.link_type;
	const value = isOtp ? event_data.otp_code : event_data.link_url;
	const template = TEMPLATES[`${event_type}:${type}`];
	const transactionalId = template && process.env[template.env];
	if (!template || !transactionalId) {
		return fail(422, `No Loops transactional email set for ${event_type} (${type})`);
	}
	if (!value) return fail(400, `The ${event_type} event has no code or link`);

	await loops.sendTransactionalEmail({
		transactionalId,
		email: user.email,
		dataVariables: { [template.variable]: value },
	});
	return new Response(null, { status: 200 });
}

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") return fail(405, "Use POST");

		const apiKey = process.env.LOOPS_API_KEY;
		const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
		if (!apiKey || !jwksUrl) {
			return fail(503, "Set LOOPS_API_KEY and enable Managed Better Auth on this branch");
		}

		let event: NeonAuthEvent;
		try {
			event = await verifyWebhook(await request.text(), request.headers, jwksUrl);
		} catch (error) {
			return fail(error instanceof KeysUnavailable ? 502 : 401, (error as Error).message);
		}

		if (sentEvents.has(event.event_id)) return new Response(null, { status: 200 });

		try {
			const response = await handle(event, getClient(apiKey));
			if (response.ok) markSent(event.event_id);
			return response;
		} catch (error) {
			return fail(502, (error as Error).message);
		}
	},
};
