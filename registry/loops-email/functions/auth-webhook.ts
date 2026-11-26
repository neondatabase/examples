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
// Refetch the signing keys for an unknown key ID at most this often, so requests with
// made-up key IDs can't make the function fetch the keys on every request.
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

type SigningKey = crypto.webcrypto.JsonWebKey & { kid: string };

// Thrown when the signing keys can't be fetched, so Neon retries instead of giving up.
class KeysUnavailable extends Error {}

let client: LoopsClient | undefined;
let signingKeys: SigningKey[] = [];
let keysFetchedAt = 0;
// IDs of events this instance already handled. Neon retries with the same event_id, so a
// retry that reaches the same instance doesn't send the email again.
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
	// Fetch the keys on first use, and again when Neon rotates to a key we haven't seen.
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
		await getSigningKey(kid, jwksUrl),
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
	// Only names that are set are sent, so an existing contact keeps the fields it has.
	if (event_type === "user.created") {
		const [firstName, ...rest] = (user.name ?? "").trim().split(/\s+/);
		const lastName = rest.join(" ");
		const properties: Record<string, string> = {};
		if (firstName) properties.firstName = firstName;
		if (lastName) properties.lastName = lastName;
		await loops.updateContact({ email: user.email, userId: user.id, properties });
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

	// Phone Number plugin codes go out by SMS, which Loops doesn't send. Emailing the code
	// would let whoever reads the inbox verify a phone number they don't control.
	if (event_type === "send.otp" && event_data.delivery_preference === "sms") {
		return fail(422, "SMS codes aren't sent through Loops");
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
			if (response.ok) {
				sentEvents.add(event.event_id);
				// A Set keeps insertion order, so this drops the oldest ID.
				if (sentEvents.size > MAX_SENT_EVENTS) sentEvents.delete(sentEvents.values().next().value!);
			}
			return response;
		} catch (error) {
			// A 5xx tells Neon to retry the delivery. There's no Idempotency-Key: Loops marks
			// a key as used even when the request fails, so a retry with the same key would
			// never send. A retry that reaches another instance can send the same code twice instead.
			return fail(502, (error as Error).message);
		}
	},
};
