import { timingSafeEqual } from "node:crypto";
import {
	createPostgresState,
	postgresSchemaStatements,
} from "@chat-adapter/state-pg";
import { createWebAdapter } from "@chat-adapter/web";
import { neon } from "@neon/ai-sdk-provider";
import { attachDatabasePool, waitUntil } from "@neon/functions";
import { streamText } from "ai";
import { Chat, type Message, type Thread } from "chat";
import { toAiMessages } from "chat/ai";
import { Pool } from "pg";

// Any text model in the AI Gateway catalog: https://neon.com/docs/ai-gateway/models
const MODEL = "claude-haiku-5-5";
const SYSTEM =
	"You are a helpful assistant in a web chat. Answer concisely in Markdown.";
// How many earlier thread messages the model sees with each new one.
const HISTORY_LIMIT = 20;

// The bearer token is the gate, not the origin: no cookies are involved, so any
// origin may call the function as long as it sends the token.
const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, content-type, x-user-id",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
attachDatabasePool(pool);

let bot: ReturnType<typeof createBot> | undefined;

function createBot() {
	const chat = new Chat({
		userName: "neon-bot",
		adapters: {
			web: createWebAdapter({
				userName: "neon-bot",
				// fetch has checked the token and the header before the adapter runs.
				// The user id becomes part of the thread id: web:<user>:<chat id>.
				getUser: (request) => ({ id: request.headers.get("x-user-id") ?? "" }),
			}),
		},
		// Postgres keeps each conversation's messages, so the model sees earlier
		// turns even though the adapter reads only the latest one from the body.
		state: createPostgresState({ client: pool, autoCreateSchema: false }),
	});

	// Every web conversation is a direct message with the bot.
	chat.onDirectMessage(reply);

	return chat;
}

async function reply(thread: Thread, message: Message) {
	// Read from Postgres, newest first.
	const earlier: Message[] = [];
	for await (const item of thread.messages) {
		if (item.id !== message.id) earlier.push(item);
		if (earlier.length === HISTORY_LIMIT) break;
	}
	const history = await toAiMessages(earlier);
	// The window can start on a bot reply; the model expects a user turn first.
	while (history[0]?.role === "assistant") history.shift();
	// The message being answered goes last. A regenerate() resends it with the
	// same id, so its earlier copy is left out of the history above.
	const latest = await toAiMessages([message]);
	// Nothing the model can read, such as a message with only a video.
	if (latest.length === 0) return;

	const result = streamText({
		model: neon(MODEL),
		system: SYSTEM,
		messages: [...history, ...latest],
		// useChat's stop() aborts the request, which ends the generation.
		abortSignal: thread.signal,
	});
	await thread.post(result.fullStream);
}

// The tables (chat_state_*) are created once per instance. The advisory lock
// keeps instances that start at the same time from racing on CREATE TABLE.
let schemaReady: Promise<void> | undefined;

function ensureSchema() {
	schemaReady ??= (async () => {
		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			await client.query(
				"SELECT pg_advisory_xact_lock(hashtext('chat_state_schema'))",
			);
			for (const statement of postgresSchemaStatements) {
				await client.query(statement);
			}
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK").catch(() => {});
			throw error;
		} finally {
			client.release();
		}
	})().catch((error) => {
		schemaReady = undefined;
		throw error;
	});
	return schemaReady;
}

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}
		if (request.method !== "POST") {
			return new Response(null, {
				status: 405,
				headers: { ...CORS_HEADERS, Allow: "POST, OPTIONS" },
			});
		}

		const expectedToken = process.env.CHAT_WEB_TOKEN;
		if (!expectedToken || expectedToken.length < 32) {
			return errorResponse("CHAT_WEB_TOKEN is unset or too short", 503);
		}

		const providedToken =
			request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
		const expectedBytes = Buffer.from(expectedToken);
		const providedBytes = Buffer.from(providedToken);
		const isAuthorized =
			providedBytes.length === expectedBytes.length &&
			timingSafeEqual(providedBytes, expectedBytes);
		if (!isAuthorized) {
			return errorResponse("Unauthorized", 401);
		}

		// Your backend sets this for the signed-in user. Chat SDK keys the
		// conversation by it, and uses ":" as the thread id separator.
		const userId = request.headers.get("x-user-id") ?? "";
		if (!userId.trim() || userId.length > 200 || userId.includes(":")) {
			return errorResponse(
				"Send X-User-Id: 1-200 characters, without a colon",
				400,
			);
		}

		// Neon injects these on a linked branch with aiGateway enabled in neon.ts.
		if (
			!process.env.DATABASE_URL ||
			!process.env.NEON_AI_GATEWAY_BASE_URL ||
			!process.env.NEON_AI_GATEWAY_TOKEN
		) {
			return errorResponse(
				"DATABASE_URL or AI Gateway is missing. Run `neon config add ai-gateway`, then `neon deploy --env .env.local`.",
				503,
			);
		}

		try {
			await ensureSchema();
			bot ??= createBot();
		} catch (error) {
			console.error("Chat SDK setup failed", error);
			return errorResponse("Bot setup failed", 502);
		}

		// The body useChat sends ({ id, messages }). The adapter answers with the
		// AI SDK UI message stream; model errors arrive as error chunks in it.
		const response = await bot.webhooks.web(request, { waitUntil });
		const headers = new Headers(response.headers);
		for (const [name, value] of Object.entries(CORS_HEADERS)) {
			headers.set(name, value);
		}
		return new Response(response.body, { status: response.status, headers });
	},
};

function errorResponse(error: string, status: number): Response {
	return Response.json({ error }, { status, headers: CORS_HEADERS });
}
