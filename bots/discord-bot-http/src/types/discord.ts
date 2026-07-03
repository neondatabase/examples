import * as z from "zod";
import {
  discordApplicationCommandSchema,
  discordInteractionResponseDataSchema,
  discordInteractionSchema,
  registerDiscordCommandsInputSchema,
} from "../schemas/discord.js";

export type DiscordInteraction = z.infer<typeof discordInteractionSchema>;

export type DiscordApplicationCommand = z.infer<typeof discordApplicationCommandSchema>;

export type RegisterDiscordCommandsInput = z.infer<typeof registerDiscordCommandsInputSchema>;

export type DiscordEmbed = {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
  };
  timestamp?: string;
};

export type DiscordComponent =
  | {
      type: number;
      content?: string;
      custom_id?: string;
      label?: string;
      style?: number;
      disabled?: boolean;
      divider?: boolean;
      spacing?: number;
      accent_color?: number;
      components?: DiscordComponent[];
    };

export type DiscordInteractionResponseData = z.infer<typeof discordInteractionResponseDataSchema> & {
  components?: DiscordComponent[];
  embeds?: DiscordEmbed[];
};
