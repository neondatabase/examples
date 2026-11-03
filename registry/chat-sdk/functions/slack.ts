import { createSlackAdapter } from "@chat-adapter/slack";
import {
	createPostgresState,
	postgresSchemaStatements,
} from "@chat-adapter/state-pg";
import { neon } from "@neon/ai-sdk-provider";
import { attachDatabasePool, waitUntil } from "@neon/functions";
import { streamText } from "ai";
import { Chat, type Message, type Thread } from "chat";
import { toAiMessages } from "chat/ai";
import { Pool } from "pg";

// Any text model in the AI Gateway catalog: https://neon.com/docs/ai-gateway/models
const MODEL = "claude-haiku-5-5";
const SYSTEM =
	"You are a helpful assistant in a Slack workspace. Several people may write in a thread; their names prefix their messages. Answer concisely in Markdown.";
// How many earlier thread messages the model sees with each new one.
const HISTORY_LIMIT = 20;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
attachDatabasePool(pool);

let bot: ReturnType<typeof createBot> | undefined;

function createBot() {
	const chat = new Chat({
		userName: "neon-bot",
		adapters: {
			slack: createSlackAdapter({
				botToken: process.env.SLACK_BOT_TOKEN,
				signingSecret: process.env.SLACK_SIGNING_SECRET,
				// Slack's agent messaging experience, the only one new Slack apps get.
				// The manifest in the README turns it on (features.agent_view). Each
				// DM the user starts is its own thread, with a native stop button.
				agentView: true,
			}),
		},
		// Subscriptions, locks, deduplication, and queued messages live in
		// Postgres, so every instance of the function shares them.
		state: createPostgresState({ client: pool, autoCreateSchema: false }),
		// A message that arrives while the bot is replying in the same thread
		// waits for that reply instead of being dropped.
		concurrency: "queue",
	});

	// An @mention starts a conversation. Subscribing makes the bot answer the
	// rest of the thread without being mentioned again.
	chat.onNewMention(async (thread, message) => {
		await thread.subscribe();
		await reply(thread, message);
	});
	chat.onSubscribedMessage(reply);
	chat.onDirectMessage(reply);

	return chat;
}

async function reply(thread: Thread, message: Message) {
	// Slack returns the thread from its API, newest first.
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
		// Slack's stop button aborts the turn, even when the stop event reaches
		// another instance: the abort travels through Postgres.
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
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
		}

		if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_SIGNING_SECRET) {
			return Response.json(
				{ error: "Set SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET" },
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

		// The adapter verifies Slack's signature and answers within Slack's 3s
		// deadline. The reply runs after the response, kept alive by waitUntil.
		return bot.webhooks.slack(request, { waitUntil });
	},
};
