import type { InlineKeyboardMarkup } from "@grammyjs/types";
import {
  TELEGRAM_BOT_COMMANDS,
  TELEGRAM_BUTTON_TEST_ACTIONS,
  TELEGRAM_BUTTON_TEST_CALLBACK_PREFIX,
} from "../constants/telegram.js";
import type {
  TelegramButtonTestAction,
  TelegramInfoResponseInput,
  TelegramOutboundMessage,
  TelegramProfileResponseInput,
} from "../types/telegram.js";
import { escapeTelegramHtml } from "./telegramText.js";

const createButtonTestCallbackData = (action: TelegramButtonTestAction): string =>
  `${TELEGRAM_BUTTON_TEST_CALLBACK_PREFIX}:${action}`;

const formatButtonTimestamp = (date: Date): string =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(date);

const createButtonTestKeyboard = (): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: "Refresh", callback_data: createButtonTestCallbackData(TELEGRAM_BUTTON_TEST_ACTIONS.REFRESH) },
      { text: "Echo", callback_data: createButtonTestCallbackData(TELEGRAM_BUTTON_TEST_ACTIONS.ECHO) },
    ],
    [
      { text: "Time", callback_data: createButtonTestCallbackData(TELEGRAM_BUTTON_TEST_ACTIONS.TIME) },
      { text: "Confirm", callback_data: createButtonTestCallbackData(TELEGRAM_BUTTON_TEST_ACTIONS.CONFIRM) },
    ],
  ],
});

export const createHelpMessage = (chatId: TelegramOutboundMessage["chatId"]): TelegramOutboundMessage => ({
  chatId,
  text: [
    "<b>Neon Telegram Bot Help</b>",
    "",
    ...TELEGRAM_BOT_COMMANDS.map((command) => `/${command.command} - ${escapeTelegramHtml(command.description)}`),
  ].join("\n"),
});

export const createInfoMessage = (
  chatId: TelegramOutboundMessage["chatId"],
  { branch, functionUrl, method, platform, runtime }: TelegramInfoResponseInput,
): TelegramOutboundMessage => ({
  chatId,
  text: [
    "<b>Neon Telegram Bot Info</b>",
    "",
    `<b>Runtime:</b> ${escapeTelegramHtml(runtime)}`,
    `<b>Platform:</b> ${escapeTelegramHtml(platform)}`,
    `<b>Request method:</b> ${escapeTelegramHtml(method)}`,
    `<b>Neon branch:</b> ${escapeTelegramHtml(branch)}`,
    `<b>Function URL:</b> ${escapeTelegramHtml(functionUrl)}`,
  ].join("\n"),
});

export const createProfileMessage = (
  chatId: TelegramOutboundMessage["chatId"],
  { name, totalRuns, usageLines }: TelegramProfileResponseInput,
): TelegramOutboundMessage => ({
  chatId,
  text: [
    "<b>Your Profile</b>",
    "",
    `<b>Name:</b> ${name ? `<b>${escapeTelegramHtml(name)}</b>` : "not set"}`,
    `<b>Total commands run:</b> ${totalRuns}`,
    "<b>Storage:</b> Neon Postgres via Drizzle",
    "",
    "<b>Command usage</b>",
    ...usageLines.map(escapeTelegramHtml),
  ].join("\n"),
});

export const createButtonTestMessage = (
  chatId: TelegramOutboundMessage["chatId"],
  status = "Tap a button below to test Telegram callback queries.",
): TelegramOutboundMessage => ({
  chatId,
  text: ["<b>Button Test</b>", escapeTelegramHtml(status)].join("\n"),
  replyMarkup: createButtonTestKeyboard(),
});

export const parseButtonTestCallbackData = (callbackData: string): TelegramButtonTestAction | undefined => {
  const [prefix, action] = callbackData.split(":");

  if (prefix !== TELEGRAM_BUTTON_TEST_CALLBACK_PREFIX) {
    return undefined;
  }

  switch (action) {
    case TELEGRAM_BUTTON_TEST_ACTIONS.REFRESH:
    case TELEGRAM_BUTTON_TEST_ACTIONS.ECHO:
    case TELEGRAM_BUTTON_TEST_ACTIONS.TIME:
    case TELEGRAM_BUTTON_TEST_ACTIONS.CONFIRM:
      return action;
    default:
      return undefined;
  }
};

export const createButtonTestClickMessage = (
  chatId: TelegramOutboundMessage["chatId"],
  action: TelegramButtonTestAction,
): TelegramOutboundMessage => {
  const clickedAt = formatButtonTimestamp(new Date());

  switch (action) {
    case TELEGRAM_BUTTON_TEST_ACTIONS.REFRESH:
      return createButtonTestMessage(chatId, `Refreshed at ${clickedAt} UTC.`);
    case TELEGRAM_BUTTON_TEST_ACTIONS.ECHO:
      return createButtonTestMessage(chatId, "Echo: Telegram callback queries are working.");
    case TELEGRAM_BUTTON_TEST_ACTIONS.TIME:
      return createButtonTestMessage(chatId, `Current server time: ${clickedAt} UTC.`);
    case TELEGRAM_BUTTON_TEST_ACTIONS.CONFIRM:
      return createButtonTestMessage(chatId, "Confirmed: the callback was handled by the Neon Function.");
  }
};
