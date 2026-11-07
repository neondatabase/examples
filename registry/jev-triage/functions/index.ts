import { timingSafeEqual } from "node:crypto";
import { neon } from "@neon/ai-sdk-provider";
import {
	APICallError,
	experimental_decide as decide,
	Experimental_DecisionRefusalError,
	RetryError,
} from "ai";

const MODEL = "typesafeai-jev-1-14-0";
const MAX_MESSAGE_LENGTH = 20_000;

const SPAM_THRESHOLD = 0.8;
const CHURN_THRESHOLD = 0.6;
const ESCALATE_URGENCY = 2.5;

const URGENCY_LEVELS = [
	"Can wait a few days",
	"Should be handled today",
	"Blocks the customer's work",
	"Production outage, data loss, or a security incident",
];

const QUESTIONS = {
	topic: {
		type: "choice",
		instructions: "Which team should handle this support message?",
		criteria: {
			billing: "Charges, invoices, refunds, or plan changes",
			bug: "Something is broken, erroring, or slower than it should be",
			howto: "Asking how to do something with the product",
			account: "Sign-in, access, or account settings",
			feature: "Asking for functionality that does not exist yet",
			other: null,
		},
	},
	urgency: {
		type: "score",
		instructions: "How urgent is this message for the customer?",
		criteria: URGENCY_LEVELS,
	},
	frustrated: {
		type: "boolean",
		instructions: "Is the customer frustrated or angry?",
	},
	churn: {
		type: "boolean",
		instructions: "Is the customer threatening to cancel, downgrade, or switch to a competitor?",
	},
	spam: {
		type: "boolean",
		instructions: "Is this spam, a sales pitch, or otherwise not a real support request?",
	},
} as const;

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
		}

		const expectedToken = process.env.JEV_TRIAGE_TOKEN;
		if (!expectedToken || expectedToken.length < 32) {
			return Response.json({ error: "Jev triage function is not configured" }, { status: 503 });
		}

		const providedToken = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
		const expectedBytes = Buffer.from(expectedToken);
		const providedBytes = Buffer.from(providedToken);
		const isAuthorized =
			providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
		if (!isAuthorized) {
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		}

		let input: unknown;
		try {
			input = await request.json();
		} catch {
			return Response.json({ error: "Expected a JSON body" }, { status: 400 });
		}

		const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
		const { subject, message } = body as Record<string, unknown>;
		const isValidMessage =
			typeof message === "string" &&
			message.trim().length > 0 &&
			message.length <= MAX_MESSAGE_LENGTH;
		if (!isValidMessage) {
			return Response.json(
				{ error: `Provide a message of 1-${MAX_MESSAGE_LENGTH} characters` },
				{ status: 400 },
			);
		}
		if (subject !== undefined && (typeof subject !== "string" || subject.length > 500)) {
			return Response.json(
				{ error: "subject must be a string of at most 500 characters" },
				{ status: 400 },
			);
		}

		try {
			const { answers, usage } = await decide({
				model: neon.decisionModel(MODEL),
				state: subject ? { subject, message } : { message },
				questions: QUESTIONS,
			});

			const { topic, urgency, frustrated, churn, spam } = answers;
			const route =
				spam.probability >= SPAM_THRESHOLD
					? "drop"
					: urgency.score >= ESCALATE_URGENCY || churn.probability >= CHURN_THRESHOLD
						? "escalate"
						: "queue";

			return Response.json({
				route,
				topic: {
					choice: topic.choice,
					probabilities: topic.probabilities ?? null,
				},
				urgency: {
					score: urgency.score,
					level: URGENCY_LEVELS[mostLikelyLevel(urgency)],
				},
				frustrated: frustrated.probability,
				churnRisk: churn.probability,
				spam: spam.probability,
				model: MODEL,
				usage,
			});
		} catch (error) {
			return getErrorResponse(error);
		}
	},
};

function mostLikelyLevel(answer: { score: number; probabilities?: Record<string, number> }): number {
	const entries = Object.entries(answer.probabilities ?? {});
	if (entries.length === 0) return Math.round(answer.score);
	return Number(entries.reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0]);
}

function getErrorResponse(error: unknown): Response {
	if (Experimental_DecisionRefusalError.isInstance(error)) {
		return Response.json({ error: "Jev declined to answer for this message" }, { status: 422 });
	}

	const cause = RetryError.isInstance(error) ? error.lastError : error;
	const status = APICallError.isInstance(cause) ? cause.statusCode : undefined;
	if (status === 429) {
		return Response.json({ error: "AI Gateway rate limit reached" }, { status: 429 });
	}
	if (status === 401 || status === 403) {
		return Response.json({ error: "AI Gateway rejected the credentials" }, { status: 502 });
	}
	if (status === undefined && !process.env.NEON_AI_GATEWAY_BASE_URL) {
		return Response.json(
			{
				error:
					"AI Gateway is not enabled. Run `neon config add ai-gateway`, then `neon deploy --env .env.local`.",
			},
			{ status: 503 },
		);
	}

	console.error("[jev-triage] decision failed:", error);
	return Response.json({ error: "Decision request failed" }, { status: 502 });
}
