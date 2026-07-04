import {
  TELEGRAM_BUTTONS_COMMAND_NAME,
  TELEGRAM_HELP_COMMAND_NAME,
  TELEGRAM_INFO_COMMAND_NAME,
  TELEGRAM_NAME_COMMAND_NAME,
  TELEGRAM_PING_COMMAND_NAME,
  TELEGRAM_PROFILE_COMMAND_NAME,
  TELEGRAM_WEBHOOK_PATH,
} from "../constants/telegram.js";
import type { TelegramCommandHandler, TelegramMessage, TelegramOutboundMessage } from "../types/telegram.js";
import {
  createButtonTestMessage,
  createHelpMessage,
  createInfoMessage,
  createProfileMessage,
} from "./generalComponents.js";
import {
  createErrorMessage,
  createPingMessage,
  createWarmingUpMessage,
  withResponseDeadline,
} from "./telegramResponses.js";
import { escapeTelegramHtml } from "./telegramText.js";
import { getCommandUsage, getStoredName, setStoredName, trackCommandRun } from "./userNames.js";

const getTelegramMessageUserId = (message: TelegramMessage): string | undefined =>
  message.from?.id === undefined ? undefined : String(message.from.id);

const createNameCommandResponse = async (
  message: TelegramMessage,
  name: string | undefined,
): Promise<TelegramOutboundMessage> => {
  const chatId = message.chat.id;
  const userId = getTelegramMessageUserId(message);

  if (!userId) {
    return createErrorMessage(chatId, "Could not identify your Telegram user for the /name command.");
  }

  try {
    const trimmedName = name?.trim();

    if (trimmedName) {
      await setStoredName(userId, trimmedName);

      return {
        chatId,
        text: `<b>Name Saved</b>\nSaved your name as <b>${escapeTelegramHtml(trimmedName)}</b>.`,
      };
    }

    const storedName = await getStoredName(userId);

    return {
      chatId,
      text: [
        "<b>Stored Name</b>",
        storedName
          ? `Your stored name is <b>${escapeTelegramHtml(storedName)}</b>.`
          : "You do not have a stored name yet. Run /name &lt;your name&gt; to save one.",
      ].join("\n"),
    };
  } catch (error) {
    console.error("Name command failed.", error);

    return createErrorMessage(chatId, "The /name command could not reach the Neon database.");
  }
};

const createProfileCommandResponse = async (message: TelegramMessage): Promise<TelegramOutboundMessage> => {
  const chatId = message.chat.id;
  const userId = getTelegramMessageUserId(message);

  if (!userId) {
    return createErrorMessage(chatId, "Could not identify your Telegram user for the /profile command.");
  }

  try {
    const [storedName, commandUsage] = await Promise.all([getStoredName(userId), getCommandUsage(userId)]);
    const sortedCommandUsage = [...commandUsage].sort((first, second) =>
      first.commandName.localeCompare(second.commandName),
    );
    const totalRuns = sortedCommandUsage.reduce((total, usage) => total + usage.runCount, 0);
    const usageLines =
      sortedCommandUsage.length > 0
        ? sortedCommandUsage.map((usage) => `- /${usage.commandName}: ${usage.runCount}`)
        : ["- No command usage tracked yet."];

    return createProfileMessage(chatId, {
      name: storedName,
      totalRuns,
      usageLines,
    });
  } catch (error) {
    console.error("Profile command failed.", error);

    return createErrorMessage(chatId, "The /profile command could not reach the Neon database.");
  }
};

export const trackTelegramCommandRun = async (message: TelegramMessage, commandName: string): Promise<void> => {
  const userId = getTelegramMessageUserId(message);

  if (!userId) {
    return;
  }

  try {
    await trackCommandRun(userId, commandName);
  } catch (error) {
    console.error("Command usage tracking failed.", error);
  }
};

export const commandHandlers: Record<string, TelegramCommandHandler> = {
  [TELEGRAM_PING_COMMAND_NAME]: ({ message }) => createPingMessage(message.chat.id, message),
  [TELEGRAM_INFO_COMMAND_NAME]: ({ message, request, url }) =>
    createInfoMessage(message.chat.id, {
      branch: process.env.NEON_BRANCH ?? "not set",
      functionUrl: `${url.origin}${TELEGRAM_WEBHOOK_PATH}`,
      method: request.method,
      platform: `${process.platform} ${process.arch}`,
      runtime: `Node.js ${process.version}`,
    }),
  [TELEGRAM_HELP_COMMAND_NAME]: ({ message }) => createHelpMessage(message.chat.id),
  [TELEGRAM_BUTTONS_COMMAND_NAME]: ({ message }) => createButtonTestMessage(message.chat.id),
  [TELEGRAM_NAME_COMMAND_NAME]: ({ args, message }) =>
    withResponseDeadline(createNameCommandResponse(message, args), () => createWarmingUpMessage(message.chat.id)),
  [TELEGRAM_PROFILE_COMMAND_NAME]: ({ message }) =>
    withResponseDeadline(createProfileCommandResponse(message), () => createWarmingUpMessage(message.chat.id)),
};
