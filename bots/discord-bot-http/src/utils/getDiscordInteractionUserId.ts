import type { DiscordInteraction } from "../types/discord.js";

export const getDiscordInteractionUserId = (interaction: DiscordInteraction): string | undefined =>
  interaction.member?.user?.id ?? interaction.user?.id;
