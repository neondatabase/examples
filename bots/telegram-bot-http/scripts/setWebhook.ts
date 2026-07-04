import { TELEGRAM_WEBHOOK_PATH } from "../src/constants/telegram.js";
import { getTelegramBotToken, getTelegramWebhookSecret } from "../src/env.js";
import { setTelegramWebhook } from "../src/utils/telegramApi.js";

const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
const secretToken = getTelegramWebhookSecret();

if (!webhookUrl) {
  throw new Error(`TELEGRAM_WEBHOOK_URL is required. Use the Neon endpoint URL with ${TELEGRAM_WEBHOOK_PATH} appended.`);
}

if (!secretToken) {
  throw new Error("TELEGRAM_WEBHOOK_SECRET is required.");
}

const result = await setTelegramWebhook({
  botToken: getTelegramBotToken(),
  secretToken,
  url: webhookUrl,
});

console.log(JSON.stringify(result, null, 2));
