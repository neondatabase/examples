import {
	createPostgresState,
	postgresSchemaStatements,
} from "@chat-adapter/state-pg";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { neon } from "@neon/ai-sdk-provider";
import { attachDatabasePool, waitUntil } from "@neon/functions";
import { streamText } from "ai";
import { Chat, type Message, type Thread } from "chat";
import { toAiMessages } from "chat/ai";
import { Pool } from "pg";

// Any text model in the AI Gateway catalog: https://neon.com/docs/ai-gateway/models
const MODEL = "claude-haiku-5-5";
const SYSTEM =
	"You are a helpful assistant in Telegram. In group chats, names prefix people's messages. Answer concisely.";
// How many earlier chat messages the model sees with each new one.
const HISTORY_LIMIT = 20;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
attachDatabasePool(pool);

let bot: ReturnType<typeof createBot> | undefined;

function createBot() {
	const chat = new Chat({
		userName: "neon-bot",
		adapters: {
			telegram: createTelegramAdapter({
				botToken: process.env.TELEGRAM_BOT_TOKEN,
				secretToken: process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN,
				// The default "auto" mode starts long polling when it doesn't detect a
				// serverless host and no webhook is registered yet. Neon Functions
				// receive updates as webhooks.
				mode: "webhook",
				// In groups, replying to one of the bot's messages counts as a mention.
				mentionOnReply: true,
			}),
		},
		// Telegram's Bot API has no message history, so Chat SDK keeps each
		// chat's messages in Postgres, along with locks and deduplication.
		state: createPostgresState({ client: pool, autoCreateSchema: false }),
		// A message that arrives while the bot is replying in the same chat waits
		// for that reply instead of being dropped.
		concurrency: "queue",
	});

	// Private chats get every message. In groups the bot answers when it is
	// mentioned, so it doesn't reply to the whole group.
	chat.onDirectMessage(reply);
	chat.onNewMention(reply);

	return chat;
}

async function reply(thread: Thread, message: Message) {
	// Read from Postgres, newest first.
	const earlier: Message[] = [];
	for await (const item of thread.messages) {
		if (item.id !== message.id) earlier.push(item);
		if (earlier.length === HISTORY_LIMIT) break;
	}
	const history = await toAiMessages(earlier, { includeNames: true });
	// The window can start on a bot reply; the model expects a user turn first.
	while (history[0]?.role === "assistant") history.shift();
	// The message being answered goes last. While it waits in the queue, the
	// reply to an earlier message can be posted after it.
	const latest = await toAiMessages([message], { includeNames: true });
	// Nothing the model can read, such as a message with only a video.
	if (latest.length === 0) return;

	await thread.startTyping();

	const result = streamText({
		model: neon(MODEL),
		system: SYSTEM,
		messages: [...history, ...latest],
		abortSignal: thread.signal,
	});
	// Telegram shows the reply as one message that is edited as text arrives.
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
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
		}

		if (
			!process.env.TELEGRAM_BOT_TOKEN ||
			!process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN
		) {
			return Response.json(
				{ error: "Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET_TOKEN" },
				{ status: 503 },
			);
		}
		// Neon injects these on a linked branch with aiGateway enabled in neon.ts.
		if (
			!process.env.DATABASE_URL ||
			!process.env.NEON_AI_GATEWAY_BASE_URL ||
			!process.env.NEON_AI_GATEWAY_TOKEN
		) {
			return Response.json(
				{
					error:
						"DATABASE_URL or AI Gateway is missing. Run `neon config add ai-gateway`, then `neon deploy --env .env.local`.",
				},
				{ status: 503 },
			);
		}

		try {
			await ensureSchema();
			bot ??= createBot();
		} catch (error) {
			console.error("Chat SDK setup failed", error);
			return Response.json({ error: "Bot setup failed" }, { status: 502 });
		}

		// The adapter checks Telegram's secret token header and acknowledges the
		// update. The reply runs after the response, kept alive by waitUntil.
		return bot.webhooks.telegram(request, { waitUntil });
	},
};
