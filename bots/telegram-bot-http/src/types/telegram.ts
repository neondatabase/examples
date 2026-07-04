import type { BotCommand, InlineKeyboardMarkup } from "@grammyjs/types";
import * as z from "zod";
import type { TELEGRAM_BUTTON_TEST_ACTIONS } from "../constants/telegram.js";
import type {
  telegramCallbackQuerySchema,
  telegramChatIdSchema,
  telegramMessageSchema,
  telegramUpdateSchema,
} from "../schemas/telegram.js";

export type TelegramChatId = z.infer<typeof telegramChatIdSchema>;

export type TelegramMessage = z.infer<typeof telegramMessageSchema>;

export type TelegramCallbackQuery = z.infer<typeof telegramCallbackQuerySchema>;

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

export type TelegramButtonTestAction =
  (typeof TELEGRAM_BUTTON_TEST_ACTIONS)[keyof typeof TELEGRAM_BUTTON_TEST_ACTIONS];

export type TelegramOutboundMessage = {
  chatId: TelegramChatId;
  text: string;
  replyMarkup?: InlineKeyboardMarkup;
};

export type TelegramCommandInfo = BotCommand;

export type TelegramInfoResponseInput = {
  branch: string;
  functionUrl: string;
  method: string;
  platform: string;
  runtime: string;
};

export type TelegramProfileResponseInput = {
  name: string | undefined;
  totalRuns: number;
  usageLines: string[];
};

export type TelegramCommandContext = {
  args: string | undefined;
  botToken: string;
  command: string;
  message: TelegramMessage;
  request: Request;
  url: URL;
  update: TelegramUpdate;
};

export type TelegramCommandHandler = (
  context: TelegramCommandContext,
) => TelegramOutboundMessage | Promise<TelegramOutboundMessage>;
