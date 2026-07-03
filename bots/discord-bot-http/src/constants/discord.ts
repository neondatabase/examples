export const DISCORD_INTERACTION_TYPES = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
} as const;

export const DISCORD_RESPONSE_TYPES = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  UPDATE_MESSAGE: 7,
} as const;

export const DISCORD_SIGNATURE_PUBLIC_KEY_PREFIX = "302a300506032b6570032100";

export const DISCORD_INTERACTIONS_PATH = "/api/interactions";

export const DISCORD_API_BASE_URL = "https://discord.com/api/v10";

export const DISCORD_USER_AGENT = "DiscordBot (https://neon.tech, Neon Functions Bot 1.0.0)";

export const DISCORD_COMMAND_TYPES = {
  CHAT_INPUT: 1,
} as const;

export const DISCORD_COMMAND_OPTION_TYPES = {
  STRING: 3,
  BOOLEAN: 5,
} as const;

export const DISCORD_COMPONENT_TYPES = {
  ACTION_ROW: 1,
  BUTTON: 2,
  TEXT_DISPLAY: 10,
} as const;

export const DISCORD_BUTTON_STYLES = {
  PRIMARY: 1,
  SECONDARY: 2,
  SUCCESS: 3,
  DANGER: 4,
} as const;

export const DISCORD_MESSAGE_FLAGS = {
  EPHEMERAL: 1 << 6,
  IS_COMPONENTS_V2: 1 << 15,
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

const DISCORD_EPHEMERAL_OPTION = {
  name: DISCORD_EPHEMERAL_OPTION_NAME,
  description: "Only show the response to you.",
  type: DISCORD_COMMAND_OPTION_TYPES.BOOLEAN,
  required: false,
};

const DISCORD_NAME_OPTION = {
  name: DISCORD_NAME_OPTION_NAME,
  description: "The name to store for yourself. Omit this to view your stored name.",
  type: DISCORD_COMMAND_OPTION_TYPES.STRING,
  required: false,
  min_length: 1,
  max_length: 80,
};

export const DISCORD_APPLICATION_COMMANDS = [
  {
    name: DISCORD_PING_COMMAND_NAME,
    description: DISCORD_PING_COMMAND_DESCRIPTION,
    type: DISCORD_COMMAND_TYPES.CHAT_INPUT,
    options: [DISCORD_EPHEMERAL_OPTION],
  },
  {
    name: DISCORD_INFO_COMMAND_NAME,
    description: DISCORD_INFO_COMMAND_DESCRIPTION,
    type: DISCORD_COMMAND_TYPES.CHAT_INPUT,
    options: [DISCORD_EPHEMERAL_OPTION],
  },
  {
    name: DISCORD_HELP_COMMAND_NAME,
    description: DISCORD_HELP_COMMAND_DESCRIPTION,
    type: DISCORD_COMMAND_TYPES.CHAT_INPUT,
    options: [DISCORD_EPHEMERAL_OPTION],
  },
  {
    name: DISCORD_BUTTONS_COMMAND_NAME,
    description: DISCORD_BUTTONS_COMMAND_DESCRIPTION,
    type: DISCORD_COMMAND_TYPES.CHAT_INPUT,
    options: [DISCORD_EPHEMERAL_OPTION],
  },
  {
    name: DISCORD_NAME_COMMAND_NAME,
    description: DISCORD_NAME_COMMAND_DESCRIPTION,
    type: DISCORD_COMMAND_TYPES.CHAT_INPUT,
    options: [DISCORD_NAME_OPTION, DISCORD_EPHEMERAL_OPTION],
  },
  {
    name: DISCORD_PROFILE_COMMAND_NAME,
    description: DISCORD_PROFILE_COMMAND_DESCRIPTION,
    type: DISCORD_COMMAND_TYPES.CHAT_INPUT,
    options: [DISCORD_EPHEMERAL_OPTION],
  },
];
