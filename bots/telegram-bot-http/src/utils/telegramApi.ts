import type { BotCommand, InlineKeyboardMarkup } from "@grammyjs/types";
import {
  TELEGRAM_API_BASE_URL,
  TELEGRAM_BOT_COMMANDS,
  TELEGRAM_PARSE_MODE,
  TELEGRAM_USER_AGENT,
} from "../constants/telegram.js";
import { telegramApiResponseSchema } from "../schemas/telegram.js";
import type { TelegramChatId, TelegramOutboundMessage } from "../types/telegram.js";

type TelegramApiRequestInput = {
  botToken: string;
  method: string;
  payload: Record<string, unknown>;
};

type SendTelegramMessageInput = {
  botToken: string;
} & TelegramOutboundMessage;

type EditTelegramMessageInput = {
  botToken: string;
  chatId: TelegramChatId;
  messageId: number;
  replyMarkup?: InlineKeyboardMarkup;
  text: string;
};

type AnswerTelegramCallbackQueryInput = {
  botToken: string;
  callbackQueryId: string;
  text?: string;
};

type SetTelegramWebhookInput = {
  botToken: string;
  secretToken: string;
  url: string;
};

const createTelegramApiUrl = (botToken: string, method: string): string =>
  `${TELEGRAM_API_BASE_URL}/bot${botToken}/${method}`;

export const telegramApiRequest = async <Result = unknown>({
  botToken,
  method,
  payload,
}: TelegramApiRequestInput): Promise<Result> => {
  const response = await fetch(createTelegramApiUrl(botToken, method), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": TELEGRAM_USER_AGENT,
    },
    body: JSON.stringify(payload),
  });

  const responseBody: unknown = await response.json();
  const parsedResponse = telegramApiResponseSchema.parse(responseBody);

  if (!response.ok || !parsedResponse.ok) {
    throw new Error(
      `Telegram API ${method} failed (${response.status}): ${JSON.stringify(responseBody)}`,
    );
  }

  return parsedResponse.result as Result;
};

export const sendTelegramMessage = ({ botToken, chatId, text, replyMarkup }: SendTelegramMessageInput) =>
  telegramApiRequest({
    botToken,
    method: "sendMessage",
    payload: {
      chat_id: chatId,
      text,
      parse_mode: TELEGRAM_PARSE_MODE,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    },
  });

export const editTelegramMessageText = ({
  botToken,
  chatId,
  messageId,
  replyMarkup,
  text,
}: EditTelegramMessageInput) =>
  telegramApiRequest({
    botToken,
    method: "editMessageText",
    payload: {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: TELEGRAM_PARSE_MODE,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    },
  });

export const answerTelegramCallbackQuery = ({
  botToken,
  callbackQueryId,
  text,
}: AnswerTelegramCallbackQueryInput) =>
  telegramApiRequest({
    botToken,
    method: "answerCallbackQuery",
    payload: {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    },
  });

export const registerTelegramCommands = (botToken: string, commands: BotCommand[] = TELEGRAM_BOT_COMMANDS) =>
  telegramApiRequest({
    botToken,
    method: "setMyCommands",
    payload: { commands },
  });

export const setTelegramWebhook = ({ botToken, secretToken, url }: SetTelegramWebhookInput) =>
  telegramApiRequest({
    botToken,
    method: "setWebhook",
    payload: {
      url,
      secret_token: secretToken,
      allowed_updates: ["message", "callback_query"],
    },
  });
