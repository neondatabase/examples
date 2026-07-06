export const WHATSAPP_WEBHOOK_PATH = "/api/webhook";

export const WHATSAPP_GRAPH_API_BASE_URL = "https://graph.facebook.com/v21.0";

export const WHATSAPP_USER_AGENT = "WhatsAppBot (https://neon.tech, Neon Functions Bot 1.0.0)";

export const WHATSAPP_DB_RESPONSE_DEADLINE_MS = 2500;

export const WHATSAPP_PING_COMMAND_NAME = "ping";

export const WHATSAPP_PING_COMMAND_DESCRIPTION = "Return pong with an estimated WhatsApp webhook latency.";

export const WHATSAPP_INFO_COMMAND_NAME = "info";

export const WHATSAPP_INFO_COMMAND_DESCRIPTION = "Show runtime and request information for this bot.";

export const WHATSAPP_HELP_COMMAND_NAME = "help";

export const WHATSAPP_HELP_COMMAND_DESCRIPTION = "Show a dynamic command list for this bot.";

export const WHATSAPP_BUTTONS_COMMAND_NAME = "buttons";

export const WHATSAPP_BUTTONS_COMMAND_DESCRIPTION = "Show an interactive button test message.";

export const WHATSAPP_NAME_COMMAND_NAME = "name";

export const WHATSAPP_NAME_COMMAND_DESCRIPTION = "Save or view your stored display name.";

export const WHATSAPP_PROFILE_COMMAND_NAME = "profile";

export const WHATSAPP_PROFILE_COMMAND_DESCRIPTION = "Show your stored profile and command usage.";

export const WHATSAPP_BUTTON_TEST_CALLBACK_PREFIX = "button-test";

export const WHATSAPP_BUTTON_TEST_ACTIONS = {
  REFRESH: "refresh",
  ECHO: "echo",
  TIME: "time",
} as const;

export const WHATSAPP_BOT_COMMANDS = [
  {
    command: WHATSAPP_PING_COMMAND_NAME,
    description: WHATSAPP_PING_COMMAND_DESCRIPTION,
  },
  {
    command: WHATSAPP_INFO_COMMAND_NAME,
    description: WHATSAPP_INFO_COMMAND_DESCRIPTION,
  },
  {
    command: WHATSAPP_HELP_COMMAND_NAME,
    description: WHATSAPP_HELP_COMMAND_DESCRIPTION,
  },
  {
    command: WHATSAPP_BUTTONS_COMMAND_NAME,
    description: WHATSAPP_BUTTONS_COMMAND_DESCRIPTION,
  },
  {
    command: WHATSAPP_NAME_COMMAND_NAME,
    description: WHATSAPP_NAME_COMMAND_DESCRIPTION,
  },
  {
    command: WHATSAPP_PROFILE_COMMAND_NAME,
    description: WHATSAPP_PROFILE_COMMAND_DESCRIPTION,
  },
];
