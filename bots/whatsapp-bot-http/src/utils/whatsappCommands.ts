import {
  WHATSAPP_BUTTONS_COMMAND_NAME,
  WHATSAPP_HELP_COMMAND_NAME,
  WHATSAPP_INFO_COMMAND_NAME,
  WHATSAPP_NAME_COMMAND_NAME,
  WHATSAPP_PING_COMMAND_NAME,
  WHATSAPP_PROFILE_COMMAND_NAME,
  WHATSAPP_WEBHOOK_PATH,
} from "../constants/whatsapp.js";
import type {
  WhatsAppCommandHandler,
  WhatsAppMessage,
  WhatsAppOutboundMessage,
} from "../types/whatsapp.js";
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
} from "./whatsappResponses.js";
import { getCommandUsage, getStoredName, setStoredName, trackCommandRun } from "./userNames.js";

const createNameCommandResponse = async (
  message: WhatsAppMessage,
  name: string | undefined,
): Promise<WhatsAppOutboundMessage> => {
  const userId = message.from;

  try {
    const trimmedName = name?.trim();

    if (trimmedName) {
      await setStoredName(userId, trimmedName);

      return {
        to: userId,
        text: `*Name Saved*\nSaved your name as *${trimmedName}*.`,
      };
    }

    const storedName = await getStoredName(userId);

    return {
      to: userId,
      text: [
        "*Stored Name*",
        storedName
          ? `Your stored name is *${storedName}*.`
          : "You do not have a stored name yet. Send /name <your name> to save one.",
      ].join("\n"),
    };
  } catch (error) {
    console.error("Name command failed.", error);

    return createErrorMessage(userId, "The /name command could not reach the Neon database.");
  }
};

const createProfileCommandResponse = async (message: WhatsAppMessage): Promise<WhatsAppOutboundMessage> => {
  const userId = message.from;

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

    return createProfileMessage(userId, {
      name: storedName,
      totalRuns,
      usageLines,
    });
  } catch (error) {
    console.error("Profile command failed.", error);

    return createErrorMessage(userId, "The /profile command could not reach the Neon database.");
  }
};

export const trackWhatsAppCommandRun = async (message: WhatsAppMessage, commandName: string): Promise<void> => {
  try {
    await trackCommandRun(message.from, commandName);
  } catch (error) {
    console.error("Command usage tracking failed.", error);
  }
};

export const commandHandlers: Record<string, WhatsAppCommandHandler> = {
  [WHATSAPP_PING_COMMAND_NAME]: ({ message }) => createPingMessage(message.from, message),
  [WHATSAPP_INFO_COMMAND_NAME]: ({ message, request, url }) =>
    createInfoMessage(message.from, {
      branch: process.env.NEON_BRANCH ?? "not set",
      functionUrl: `${url.origin}${WHATSAPP_WEBHOOK_PATH}`,
      method: request.method,
      platform: `${process.platform} ${process.arch}`,
      runtime: `Node.js ${process.version}`,
    }),
  [WHATSAPP_HELP_COMMAND_NAME]: ({ message }) => createHelpMessage(message.from),
  [WHATSAPP_BUTTONS_COMMAND_NAME]: ({ message }) => createButtonTestMessage(message.from),
  [WHATSAPP_NAME_COMMAND_NAME]: ({ args, message }) =>
    withResponseDeadline(createNameCommandResponse(message, args), () => createWarmingUpMessage(message.from)),
  [WHATSAPP_PROFILE_COMMAND_NAME]: ({ message }) =>
    withResponseDeadline(createProfileCommandResponse(message), () => createWarmingUpMessage(message.from)),
};
