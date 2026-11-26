import crypto from "node:crypto";
import { LoopsClient } from "loops";

// Each Managed Better Auth email maps to a Loops transactional email and the data
// variable that email uses. Leave a variable unset for an email type your app doesn't send.
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

type NeonAuthEvent = {
	event_id: string;
	event_type: string;
	user: { id?: string; email: string; name?: string | null };
	event_data: {
		otp_code?: string;
		otp_type?: string;
		link_url?: string;
		link_type?: string;
		organization_name?: string;
		role?: string;
	};
};

type SigningKey = crypto.webcrypto.JsonWebKey & { kid: string };

// Thrown when the signing keys can't be fetched, so Neon retries instead of giving up.
class KeysUnavailable extends Error {}

let client: LoopsClient | undefined;
let signingKeys: SigningKey[] = [];

function getClient(apiKey: string): LoopsClient {
	client ??= new LoopsClient(apiKey);
	return client;
}

async function getSigningKey(kid: string): Promise<crypto.KeyObject> {
	let jwk = signingKeys.find((key) => key.kid === kid);
	if (!jwk) {
		// Fetch the keys on first use, and again when Neon rotates to a key we haven't seen.
		const url = `${process.env.NEON_AUTH_BASE_URL}/.well-known/jwks.json`;
		const res = await fetch(url).catch(() => null);
		if (!res?.ok) throw new KeysUnavailable("Could not fetch the Managed Better Auth signing keys");
		signingKeys = ((await res.json()) as { keys: SigningKey[] }).keys;
		jwk = signingKeys.find((key) => key.kid === kid);
	}
	if (!jwk) throw new Error(`Signing key ${kid} not found`);
	return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

async function verifyWebhook(rawBody: string, headers: Headers): Promise<NeonAuthEvent> {
	// Neon Functions strip X-Neon-* request headers, so Managed Better Auth also sends
	// each one as Neon-Better-Auth-*. Read that name first so this works on any host.
	const header = (name: string) =>
		headers.get(`neon-better-auth-${name}`) ?? headers.get(`x-neon-${name}`);
	const signature = header("signature");
	const kid = header("signature-kid");
	const timestamp = header("timestamp");
	if (!signature || !kid || !timestamp) throw new Error("Missing Neon signature headers");

	const age = Date.now() - Number(timestamp);
	if (!Number.isFinite(age) || age > MAX_AGE_MS) throw new Error("Webhook timestamp too old");

	// The signature is a detached JWS (header..signature) over the timestamp and body.
	const [jwsHeader, emptyPayload, jwsSignature] = signature.split(".");
	if (emptyPayload !== "" || !jwsSignature) throw new Error("Expected a detached JWS signature");
	const body = Buffer.from(rawBody).toString("base64url");
	const payload = Buffer.from(`${timestamp}.${body}`).toString("base64url");

	const valid = crypto.verify(
		null,
		Buffer.from(`${jwsHeader}.${payload}`),
		await getSigningKey(kid),
		Buffer.from(jwsSignature, "base64url"),
	);
	if (!valid) throw new Error("Invalid webhook signature");

	return JSON.parse(rawBody) as NeonAuthEvent;
}

// Log every failure so it shows up in the function logs, then report it to Neon.
function fail(status: number, message: string): Response {
	console.error(`[loops-email] ${status}: ${message}`);
	return Response.json({ error: message }, { status });
}

async function handle(event: NeonAuthEvent, loops: LoopsClient): Promise<Response> {
	const { event_type, event_data, user } = event;

	// A new user signed up: create their Loops contact, matched by the Managed Better Auth user ID.
	if (event_type === "user.created") {
		const [firstName = "", ...rest] = (user.name ?? "").trim().split(/\s+/);
		await loops.updateContact({
			email: user.email,
			userId: user.id,
			properties: { firstName, lastName: rest.join(" "), source: "Neon" },
		});
		return new Response(null, { status: 200 });
	}

	// A user joined an organization: send an event that can start a Loops workflow.
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

	const type = event_type === "send.otp" ? event_data.otp_type : event_data.link_type;
	const template = TEMPLATES[`${event_type}:${type}`];
	const transactionalId = template && process.env[template.env];
	const value = event_type === "send.otp" ? event_data.otp_code : event_data.link_url;

	// Neon doesn't send this email itself once you subscribe to the event, so fail
	// loudly when no Loops email is set for it instead of dropping it.
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
		if (!apiKey || !process.env.NEON_AUTH_BASE_URL) {
			return fail(503, "Set LOOPS_API_KEY and enable Managed Better Auth on this branch");
		}

		let event: NeonAuthEvent;
		try {
			event = await verifyWebhook(await request.text(), request.headers);
		} catch (error) {
			return fail(error instanceof KeysUnavailable ? 502 : 401, (error as Error).message);
		}

		try {
			return await handle(event, getClient(apiKey));
		} catch (error) {
			// A 5xx tells Neon to retry the delivery. There's no Idempotency-Key: Loops marks
			// a key as used even when the request fails, so a retry with the same key would
			// never send. A retry can occasionally send the same code twice instead.
			return fail(502, (error as Error).message);
		}
	},
};
