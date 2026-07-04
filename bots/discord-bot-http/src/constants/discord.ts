import { ApplicationCommandOptionType, ApplicationCommandType } from "discord-api-types/v10";

export const DISCORD_SIGNATURE_PUBLIC_KEY_PREFIX = "302a300506032b6570032100";

export const DISCORD_INTERACTIONS_PATH = "/api/interactions";

export const DISCORD_API_BASE_URL = "https://discord.com/api/v10";

export const DISCORD_USER_AGENT = "DiscordBot (https://neon.tech, Neon Functions Bot 1.0.0)";

export const DISCORD_EPOCH_MS = 1_420_070_400_000n;

export const DISCORD_DB_RESPONSE_DEADLINE_MS = 2500;

export const DISCORD_EMBED_COLORS = {
  PRIMARY: 0x00e599,
} as const;

export const DISCORD_PING_COMMAND_NAME = "ping";

export const DISCORD_PING_COMMAND_DESCRIPTION = "Return pong with an estimated Discord interaction latency.";

export const DISCORD_INFO_COMMAND_NAME = "info";

export const DISCORD_INFO_COMMAND_DESCRIPTION = "Show runtime and request information for this bot.";

export const DISCORD_HELP_COMMAND_NAME = "help";

export const DISCORD_HELP_COMMAND_DESCRIPTION = "Show a dynamic help panel for this bot.";

export const DISCORD_BUTTONS_COMMAND_NAME = "buttons";

export const DISCORD_BUTTONS_COMMAND_DESCRIPTION = "Show a Components v2 button test panel.";

export const DISCORD_NAME_COMMAND_NAME = "name";

export const DISCORD_NAME_COMMAND_DESCRIPTION = "Save or view your stored display name.";

export const DISCORD_NAME_OPTION_NAME = "name";

export const DISCORD_PROFILE_COMMAND_NAME = "profile";

export const DISCORD_PROFILE_COMMAND_DESCRIPTION = "Show your stored profile and command usage.";

export const DISCORD_EPHEMERAL_OPTION_NAME = "ephemeral";

export const DISCORD_BUTTON_TEST_CUSTOM_ID_PREFIX = "button-test";

export const DISCORD_BUTTON_TEST_ACTIONS = {
  PRIMARY: "primary",
  SECONDARY: "secondary",
  SUCCESS: "success",
  DANGER: "danger",
} as const;

const DISCORD_EPHEMERAL_OPTION = {
  name: DISCORD_EPHEMERAL_OPTION_NAME,
  description: "Only show the response to you.",
  type: ApplicationCommandOptionType.Boolean,
  required: false,
};

const DISCORD_NAME_OPTION = {
  name: DISCORD_NAME_OPTION_NAME,
  description: "The name to store for yourself. Omit this to view your stored name.",
  type: ApplicationCommandOptionType.String,
  required: false,
  min_length: 1,
  max_length: 80,
};

export const DISCORD_APPLICATION_COMMANDS = [
  {
    name: DISCORD_PING_COMMAND_NAME,
    description: DISCORD_PING_COMMAND_DESCRIPTION,
    type: ApplicationCommandType.ChatInput,
    options: [DISCORD_EPHEMERAL_OPTION],
  },
  {
    name: DISCORD_INFO_COMMAND_NAME,
    description: DISCORD_INFO_COMMAND_DESCRIPTION,
    type: ApplicationCommandType.ChatInput,
    options: [DISCORD_EPHEMERAL_OPTION],
  },
  {
    name: DISCORD_HELP_COMMAND_NAME,
    description: DISCORD_HELP_COMMAND_DESCRIPTION,
    type: ApplicationCommandType.ChatInput,
    options: [DISCORD_EPHEMERAL_OPTION],
  },
  {
    name: DISCORD_BUTTONS_COMMAND_NAME,
    description: DISCORD_BUTTONS_COMMAND_DESCRIPTION,
    type: ApplicationCommandType.ChatInput,
    options: [DISCORD_EPHEMERAL_OPTION],
  },
  {
    name: DISCORD_NAME_COMMAND_NAME,
    description: DISCORD_NAME_COMMAND_DESCRIPTION,
    type: ApplicationCommandType.ChatInput,
    options: [DISCORD_NAME_OPTION, DISCORD_EPHEMERAL_OPTION],
  },
  {
    name: DISCORD_PROFILE_COMMAND_NAME,
    description: DISCORD_PROFILE_COMMAND_DESCRIPTION,
    type: ApplicationCommandType.ChatInput,
    options: [DISCORD_EPHEMERAL_OPTION],
  },
];
