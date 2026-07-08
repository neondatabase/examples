import { TELEGRAM_WEBHOOK_PATH } from "../src/constants/telegram.js";
import { getTelegramBotToken, getTelegramWebhookSecret } from "../src/env.js";
import { telegramUpdateSchema } from "../src/schemas/telegram.js";
import { commandHandlers, trackTelegramCommandRun } from "../src/utils/telegramCommands.js";
import {
  createButtonTestClickMessage,
  parseButtonTestCallbackData,
} from "../src/utils/generalComponents.js";
import { jsonResponse } from "../src/utils/jsonResponse.js";
import {
  answerTelegramCallbackQuery,
  editTelegramMessageText,
  sendTelegramMessage,
} from "../src/utils/telegramApi.js";
import { createErrorMessage } from "../src/utils/telegramResponses.js";
import { parseTelegramCommand } from "../src/utils/telegramText.js";
import { verifyTelegramRequest } from "../src/utils/verifyTelegramRequest.js";

const handleCallbackQuery = async (
  botToken: string,
  update: Awaited<ReturnType<typeof telegramUpdateSchema.parse>>,
): Promise<Response> => {
  const callbackQuery = update.callback_query;

  if (!callbackQuery) {
    return jsonResponse({ ok: true });
  }

  const action = callbackQuery.data ? parseButtonTestCallbackData(callbackQuery.data) : undefined;

  if (!action) {
    await answerTelegramCallbackQuery({
      botToken,
      callbackQueryId: callbackQuery.id,
      text: "That button is not handled by this bot.",
    });

    return jsonResponse({ ok: true });
  }

  if (!callbackQuery.message) {
    await answerTelegramCallbackQuery({
      botToken,
      callbackQueryId: callbackQuery.id,
      text: "The original message is not available.",
    });

    return jsonResponse({ ok: true });
  }

  const responseMessage = createButtonTestClickMessage(callbackQuery.message.chat.id, action);

  await Promise.all([
    answerTelegramCallbackQuery({ botToken, callbackQueryId: callbackQuery.id }),
    editTelegramMessageText({
      botToken,
      chatId: responseMessage.chatId,
      messageId: callbackQuery.message.message_id,
      replyMarkup: responseMessage.replyMarkup,
      text: responseMessage.text,
    }),
  ]);

  return jsonResponse({ ok: true });
};

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  switch (request.method) {
    case "GET":
      return jsonResponse({
        ok: true,
        service: "telegram-webhook",
        webhookPath: TELEGRAM_WEBHOOK_PATH,
        webhookUrl: `${url.origin}${TELEGRAM_WEBHOOK_PATH}`,
      });
    case "POST":
      break;
    default:
      return jsonResponse({ error: "method not allowed" }, { status: 405 });
  }

  const isVerified = verifyTelegramRequest(
    getTelegramWebhookSecret(),
    request.headers.get("x-telegram-bot-api-secret-token"),
  );

  if (!isVerified) {
    return jsonResponse({ error: "invalid webhook secret" }, { status: 401 });
  }

  let payloadBody: unknown;

  try {
    payloadBody = await request.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, { status: 400 });
  }

  const parsedPayload = telegramUpdateSchema.safeParse(payloadBody);

  if (!parsedPayload.success) {
    return jsonResponse({ error: "invalid telegram update payload" }, { status: 400 });
  }

  const update = parsedPayload.data;
  const botToken = getTelegramBotToken();

  if (update.callback_query) {
    return handleCallbackQuery(botToken, update);
  }

  const message = update.message;
  const command = parseTelegramCommand(message?.text);

  if (!message || !command) {
    return jsonResponse({ ok: true });
  }

  const commandHandler = commandHandlers[command.name];

  if (commandHandler) {
    void trackTelegramCommandRun(message, command.name);

    const responseMessage = await commandHandler({
      args: command.args,
      botToken,
      command: command.name,
      message,
      request,
      update,
      url,
    });

    await sendTelegramMessage({ botToken, ...responseMessage });

    return jsonResponse({ ok: true });
  }

  await sendTelegramMessage({
    botToken,
    ...createErrorMessage(message.chat.id, "Unknown command. Try /help."),
  });

  return jsonResponse({ ok: true });
}
