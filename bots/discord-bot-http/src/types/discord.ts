import { z } from "zod";
import {
  discordApplicationCommandSchema,
  discordInteractionResponseDataSchema,
  discordInteractionSchema,
} from "../schemas/discord.js";

export type DiscordInteraction = z.infer<typeof discordInteractionSchema>;

export type DiscordApplicationCommand = z.infer<typeof discordApplicationCommandSchema>;

export type RegisterDiscordCommandsInput = {
  applicationId: string;
  botToken: string;
  guildId: string | undefined;
};

export type DiscordComponent =
  | {
      type: number;
      content: string;
    }
  | {
      type: number;
      components: Array<{
        type: number;
        custom_id: string;
        label: string;
        style: number;
        disabled?: boolean;
      }>;
    };

export type DiscordInteractionResponseData = z.infer<typeof discordInteractionResponseDataSchema> & {
  components?: DiscordComponent[];
};
