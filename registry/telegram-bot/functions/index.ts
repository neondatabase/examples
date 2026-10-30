import { neon } from "@neon/ai-sdk-provider";
import { attachDatabasePool } from "@neon/functions";
import { generateText } from "ai";
import { Pool } from "pg";

const API = "https://api.telegram.org";
const MODEL = "deepseek-v4-1-flash";
const SYSTEM = "You are a concise, helpful assistant. Reply in plain text.";
const LIMIT = 10;

const db = new Pool({
	connectionString: process.env.DATABASE_URL,
	max: 5,
});
attachDatabasePool(db);

async function initDB() {
	await db.query(`
    CREATE TABLE IF NOT EXISTS telegram_messages (
      id bigserial PRIMARY KEY,
      chat_id bigint NOT NULL,
      role text NOT NULL,
      content text NOT NULL
    )
  `);
	await db.query(`
    CREATE INDEX IF NOT EXISTS telegram_messages_chat_id_id_idx
      ON telegram_messages (chat_id, id)
  `);
}

async function reply(chatId: number, text: string) {
	const { rows } = await db.query(
		`SELECT role, content FROM (
       	 SELECT id, role, content FROM telegram_messages
       	 WHERE chat_id = $1 ORDER BY id DESC LIMIT $2
     	 ) recent ORDER BY id`,
		[chatId, LIMIT],
	);

	const { text: answer } = await generateText({
		model: neon(MODEL),
		system: SYSTEM,
		messages: [
			...rows.map(({ role, content }) => ({ role, content })),
			{ role: "user" as const, content: text },
		],
	});

	const result = answer.trim() || "I couldn't come up with a reply.";

	try {
		await db.query(
			`INSERT INTO telegram_messages (chat_id, role, content)
       		 VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
			[chatId, text, result],
		);
	} catch (error) {
		console.error("Failed to save conversation:", error);
	}

	return result;
}

async function sendMessage(token: string, chatId: number, text: string) {
	const response = await fetch(`${API}/bot${token}/sendMessage`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			chat_id: chatId,
			text: text.slice(0, 4096),
		}),
	});

	if (!response.ok) throw new Error(`Telegram API error: ${response.status}`);
}

export default {
	async fetch(request: Request): Promise<Response> {
		const token = process.env.TELEGRAM_BOT_TOKEN;
		const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

		if (!token || !secret || !process.env.DATABASE_URL) {
			return Response.json({ error: "Missing configuration" }, { status: 503 });
		}

		if (request.method === "GET") {
			await initDB();
			if (new URL(request.url).hostname !== "localhost") {
				const response = await fetch(`${API}/bot${token}/setWebhook`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						url: new URL(request.url),
						secret_token: secret,
					}),
				});
				const result = (await response.json().catch(() => null)) as {
					ok?: boolean;
					description?: string;
				} | null;
				if (!response.ok || !result?.ok) {
					return Response.json(
						{
							error: "Telegram rejected the webhook",
							detail: result?.description ?? `HTTP ${response.status}`,
						},
						{ status: 502 },
					);
				}
			}

			return Response.json({ ok: true, message: "Webhook set" });
		}

		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		if (request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		}

		try {
			const { message } = await request.json();
			const { text, chat, from } = message ?? {};

			if (!text || !chat?.id || from?.is_bot) {
				return Response.json({ ok: true });
			}

			if (text === "/start" || text === "/help") {
				await sendMessage(token, chat.id, "Hello! I'm your AI assistant. Send me a message, and I'll reply with helpful information.");
				return Response.json({ ok: true });
			}

			const answer = await reply(chat.id, text);
			await sendMessage(token, chat.id, answer);

			return Response.json({ ok: true });
		} catch (error) {
			// Acknowledge anyway: Telegram retries non-2xx responses, which would
			// call the model again and store the conversation twice.
			console.error("Webhook error:", error);
			return Response.json({ ok: false });
		}
	},
};