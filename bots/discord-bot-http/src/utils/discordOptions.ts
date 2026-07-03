import type { DiscordCommandOptions } from "../types/discord.js";

export const getBooleanCommandOption = (options: DiscordCommandOptions, name: string): boolean =>
  options.find((option) => option.name === name)?.value === true;

export const getStringCommandOption = (options: DiscordCommandOptions, name: string): string | undefined => {
  const value = options.find((option) => option.name === name)?.value;

  return typeof value === "string" ? value : undefined;
};
