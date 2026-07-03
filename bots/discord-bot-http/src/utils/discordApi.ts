import {
  DISCORD_APPLICATION_COMMANDS,
  DISCORD_API_BASE_URL,
  DISCORD_USER_AGENT,
} from "../constants/discord.js";
import {
  registeredDiscordCommandsSchema,
  registerDiscordCommandsInputSchema,
} from "../schemas/discord.js";
import type { RegisterDiscordCommandsInput } from "../types/discord.js";

const commandMentionsCache = new Map<string, Promise<Record<string, string>>>();

const getCommandUrl = ({ applicationId, guildId }: Omit<RegisterDiscordCommandsInput, "botToken">) => {
  if (guildId) {
    return `${DISCORD_API_BASE_URL}/applications/${applicationId}/guilds/${guildId}/commands`;
  }

  return `${DISCORD_API_BASE_URL}/applications/${applicationId}/commands`;
};

export const registerDiscordCommands = async ({
  applicationId,
  botToken,
  guildId,
}: RegisterDiscordCommandsInput): Promise<unknown[]> => {
  const input = registerDiscordCommandsInputSchema.parse({ applicationId, botToken, guildId });
  const response = await fetch(getCommandUrl(input), {
    method: "PUT",
    headers: {
      authorization: `Bot ${input.botToken}`,
      "content-type": "application/json",
      "user-agent": DISCORD_USER_AGENT,
    },
    body: JSON.stringify(DISCORD_APPLICATION_COMMANDS),
  });

  const responseBody: unknown = await response.json();

  if (!response.ok) {
    throw new Error(`Discord command registration failed (${response.status}): ${JSON.stringify(responseBody)}`);
  }

  return registeredDiscordCommandsSchema.parse(responseBody);
};

export const getRegisteredDiscordCommandMentions = ({
  applicationId,
  botToken,
  guildId,
}: RegisterDiscordCommandsInput): Promise<Record<string, string>> => {
  const input = registerDiscordCommandsInputSchema.parse({ applicationId, botToken, guildId });
  const cacheKey = `${input.applicationId}:${input.guildId ?? "global"}`;
  const cachedMentions = commandMentionsCache.get(cacheKey);

  if (cachedMentions) {
    return cachedMentions;
  }

  const mentions = fetchRegisteredDiscordCommandMentions(input).catch((error: unknown) => {
    commandMentionsCache.delete(cacheKey);
    throw error;
  });
  commandMentionsCache.set(cacheKey, mentions);

  return mentions;
};

const fetchRegisteredDiscordCommandMentions = async ({
  applicationId,
  botToken,
  guildId,
}: RegisterDiscordCommandsInput): Promise<Record<string, string>> => {
  const input = registerDiscordCommandsInputSchema.parse({ applicationId, botToken, guildId });
  const response = await fetch(getCommandUrl(input), {
    headers: {
      authorization: `Bot ${input.botToken}`,
      "user-agent": DISCORD_USER_AGENT,
    },
  });

  const responseBody: unknown = await response.json();

  if (!response.ok) {
    throw new Error(`Discord command lookup failed (${response.status}): ${JSON.stringify(responseBody)}`);
  }

  const commands = registeredDiscordCommandsSchema.parse(responseBody);

  return commands.reduce<Record<string, string>>((mentions, command) => {
    mentions[command.name] = `</${command.name}:${command.id}>`;
    return mentions;
  }, {});
};
