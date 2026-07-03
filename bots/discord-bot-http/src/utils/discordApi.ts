import {
  DISCORD_APPLICATION_COMMANDS,
  DISCORD_API_BASE_URL,
  DISCORD_USER_AGENT,
} from "../constants/discord.js";
import type { DiscordApplicationCommand, RegisterDiscordCommandsInput } from "../types/discord.js";

const getCommandUrl = ({ applicationId, guildId }: Omit<RegisterDiscordCommandsInput, "botToken">) => {
  if (guildId) {
    return `${DISCORD_API_BASE_URL}/applications/${applicationId}/guilds/${guildId}/commands`;
  }

  return `${DISCORD_API_BASE_URL}/applications/${applicationId}/commands`;
};

const registerDiscordCommand = async ({
  applicationId,
  botToken,
  guildId,
  command,
}: RegisterDiscordCommandsInput & { command: DiscordApplicationCommand }): Promise<unknown> => {
  const response = await fetch(getCommandUrl({ applicationId, guildId }), {
    method: "POST",
    headers: {
      authorization: `Bot ${botToken}`,
      "content-type": "application/json",
      "user-agent": DISCORD_USER_AGENT,
    },
    body: JSON.stringify(command),
  });

  const responseBody: unknown = await response.json();

  if (!response.ok) {
    throw new Error(`Discord command registration failed (${response.status}): ${JSON.stringify(responseBody)}`);
  }

  return responseBody;
};

export const registerDiscordCommands = async ({
  applicationId,
  botToken,
  guildId,
}: RegisterDiscordCommandsInput): Promise<unknown[]> => {
  const registeredCommands: unknown[] = [];

  for (const command of DISCORD_APPLICATION_COMMANDS) {
    registeredCommands.push(await registerDiscordCommand({ applicationId, botToken, guildId, command }));
  }

  return registeredCommands;
};
