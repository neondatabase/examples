import {
  DISCORD_BUTTONS_COMMAND_NAME,
  DISCORD_HELP_COMMAND_NAME,
  DISCORD_INFO_COMMAND_NAME,
  DISCORD_INTERACTIONS_PATH,
  DISCORD_NAME_COMMAND_NAME,
  DISCORD_NAME_OPTION_NAME,
  DISCORD_PING_COMMAND_NAME,
  DISCORD_PROFILE_COMMAND_NAME,
} from "../constants/discord.js";
import type { DiscordCommandHandler, DiscordInteraction, DiscordInteractionResponseData } from "../types/discord.js";
import {
  createButtonTestResponseData,
  createHelpResponseData,
  createInfoResponseData,
  createProfileResponseData,
} from "./generalComponents.js";
import { getRegisteredDiscordCommandMentions } from "./discordApi.js";
import { getDiscordInteractionUserId } from "./getDiscordInteractionUserId.js";
import { getStringCommandOption } from "./discordOptions.js";
import {
  createEmbedResponseData,
  createErrorResponseData,
  createPingResponseData,
  createWarmingUpResponseData,
  withResponseDeadline,
} from "./discordResponses.js";
import { getCommandUsage, getStoredName, setStoredName, trackCommandRun } from "./userNames.js";

const getCommandMentions = async (payload: DiscordInteraction): Promise<Record<string, string>> => {
  const applicationId = process.env.DISCORD_APPLICATION_ID ?? payload.application_id;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!applicationId || !botToken) {
    return {};
  }

  try {
    return await getRegisteredDiscordCommandMentions({
      applicationId,
      botToken,
      guildId: process.env.DISCORD_GUILD_ID,
    });
  } catch (error) {
    console.error("Discord command mention lookup failed.", error);
    return {};
  }
};

const createNameCommandResponse = async (
  payload: DiscordInteraction,
  name: string | undefined,
  ephemeral: boolean,
) => {
  const userId = getDiscordInteractionUserId(payload);

  if (!userId) {
    return createErrorResponseData("Could not identify your Discord user for the `/name` command.");
  }

  try {
    const trimmedName = name?.trim();

    if (trimmedName) {
      await setStoredName(userId, trimmedName);

      return createEmbedResponseData({
        embed: {
          title: "Name Saved",
          description: `Saved your name as **${trimmedName}**.`,
        },
        ephemeral,
        allowedMentions: true,
      });
    }

    const storedName = await getStoredName(userId);

    return createEmbedResponseData({
      embed: {
        title: "Stored Name",
        description: storedName
          ? `Your stored name is **${storedName}**.`
          : "You do not have a stored name yet. Run `/name name:<your name>` to save one.",
      },
      ephemeral,
      allowedMentions: true,
    });
  } catch (error) {
    console.error("Name command failed.", error);

    return createErrorResponseData("The `/name` command could not reach the Neon database.");
  }
};

const createProfileCommandResponse = async (payload: DiscordInteraction, ephemeral: boolean) => {
  const userId = getDiscordInteractionUserId(payload);

  if (!userId) {
    return createErrorResponseData("Could not identify your Discord user for the `/profile` command.");
  }

  try {
    const [storedName, commandUsage] = await Promise.all([getStoredName(userId), getCommandUsage(userId)]);
    const sortedCommandUsage = [...commandUsage].sort((first, second) =>
      first.commandName.localeCompare(second.commandName),
    );
    const totalRuns = sortedCommandUsage.reduce((total, usage) => total + usage.runCount, 0);
    const usageLines =
      sortedCommandUsage.length > 0
        ? sortedCommandUsage.map((usage) => `- \`/${usage.commandName}\`: ${usage.runCount}`)
        : ["- No command usage tracked yet."];

    return createProfileResponseData({
      ephemeral,
      name: storedName,
      totalRuns,
      usageLines,
    });
  } catch (error) {
    console.error("Profile command failed.", error);

    return createErrorResponseData("The `/profile` command could not reach the Neon database.");
  }
};

export const trackApplicationCommandRun = async (payload: DiscordInteraction): Promise<void> => {
  if (!payload.data?.name) {
    return;
  }

  const userId = getDiscordInteractionUserId(payload);

  if (!userId) {
    return;
  }

  try {
    await trackCommandRun(userId, payload.data.name);
  } catch (error) {
    console.error("Command usage tracking failed.", error);
  }
};

export const commandHandlers: Record<string, DiscordCommandHandler> = {
  [DISCORD_PING_COMMAND_NAME]: ({ payload, ephemeral }) => createPingResponseData(payload, ephemeral),
  [DISCORD_INFO_COMMAND_NAME]: ({ request, url, ephemeral }) =>
    createInfoResponseData({
      branch: process.env.NEON_BRANCH ?? "not set",
      ephemeral,
      functionUrl: `${url.origin}${DISCORD_INTERACTIONS_PATH}`,
      method: request.method,
      platform: `${process.platform} ${process.arch}`,
      runtime: `Node.js ${process.version}`,
    }),
  [DISCORD_HELP_COMMAND_NAME]: async ({ payload, ephemeral }) =>
    createHelpResponseData(ephemeral, await getCommandMentions(payload)),
  [DISCORD_BUTTONS_COMMAND_NAME]: ({ ephemeral }) => createButtonTestResponseData(ephemeral),
  [DISCORD_NAME_COMMAND_NAME]: ({ payload, options, ephemeral }) =>
    withResponseDeadline(
      createNameCommandResponse(payload, getStringCommandOption(options, DISCORD_NAME_OPTION_NAME), ephemeral),
      createWarmingUpResponseData,
    ),
  [DISCORD_PROFILE_COMMAND_NAME]: ({ payload, ephemeral }) =>
    withResponseDeadline(createProfileCommandResponse(payload, ephemeral), createWarmingUpResponseData),
};
