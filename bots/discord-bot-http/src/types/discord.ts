import type { APIEmbed, APIInteractionResponseCallbackData } from "discord-api-types/v10";
import * as z from "zod";
import {
  discordInteractionSchema,
  registerDiscordCommandsInputSchema,
} from "../schemas/discord.js";
import type { DISCORD_BUTTON_TEST_ACTIONS } from "../constants/discord.js";

export type DiscordInteraction = z.infer<typeof discordInteractionSchema>;

export type RegisterDiscordCommandsInput = z.infer<typeof registerDiscordCommandsInputSchema>;

export type DiscordCommandOptions = NonNullable<NonNullable<DiscordInteraction["data"]>["options"]>;

export type DiscordEmbed = APIEmbed;

export type DiscordInteractionResponseData = APIInteractionResponseCallbackData;

export type DiscordEmbedResponseInput = {
  embed: DiscordEmbed;
  ephemeral: boolean;
  allowedMentions?: boolean;
};

export type ButtonTestAction = (typeof DISCORD_BUTTON_TEST_ACTIONS)[keyof typeof DISCORD_BUTTON_TEST_ACTIONS];

export type DiscordInfoResponseInput = {
  branch: string;
  ephemeral: boolean;
  functionUrl: string;
  method: string;
  platform: string;
  runtime: string;
};

export type DiscordProfileResponseInput = {
  ephemeral: boolean;
  name: string | undefined;
  totalRuns: number;
  usageLines: string[];
};

export type DiscordCommandContext = {
  payload: DiscordInteraction;
  request: Request;
  url: URL;
  ephemeral: boolean;
  options: DiscordCommandOptions;
};

export type DiscordCommandHandler = (
  context: DiscordCommandContext,
) => DiscordInteractionResponseData | Promise<DiscordInteractionResponseData>;

export type VerifyDiscordRequestInput = {
  body: string;
  publicKey: string | undefined;
  signature: string | null;
  timestamp: string | null;
};
