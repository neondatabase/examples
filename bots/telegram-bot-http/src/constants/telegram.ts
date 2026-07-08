export const TELEGRAM_WEBHOOK_PATH = "/api/webhook";

export const TELEGRAM_API_BASE_URL = "https://api.telegram.org";

export const TELEGRAM_USER_AGENT = "TelegramBot (https://neon.tech, Neon Functions Bot 1.0.0)";

export const TELEGRAM_DB_RESPONSE_DEADLINE_MS = 2500;

export const TELEGRAM_PARSE_MODE = "HTML";

export const TELEGRAM_PING_COMMAND_NAME = "ping";

export const TELEGRAM_PING_COMMAND_DESCRIPTION = "Return pong with an estimated Telegram webhook latency.";

export const TELEGRAM_INFO_COMMAND_NAME = "info";

export const TELEGRAM_INFO_COMMAND_DESCRIPTION = "Show runtime and request information for this bot.";

export const TELEGRAM_HELP_COMMAND_NAME = "help";

export const TELEGRAM_HELP_COMMAND_DESCRIPTION = "Show a dynamic help panel for this bot.";

export const TELEGRAM_BUTTONS_COMMAND_NAME = "buttons";

export const TELEGRAM_BUTTONS_COMMAND_DESCRIPTION = "Show an inline keyboard button test panel.";

export const TELEGRAM_NAME_COMMAND_NAME = "name";

export const TELEGRAM_NAME_COMMAND_DESCRIPTION = "Save or view your stored display name.";

export const TELEGRAM_PROFILE_COMMAND_NAME = "profile";

export const TELEGRAM_PROFILE_COMMAND_DESCRIPTION = "Show your stored profile and command usage.";

export const TELEGRAM_BUTTON_TEST_CALLBACK_PREFIX = "button-test";

export const TELEGRAM_BUTTON_TEST_ACTIONS = {
  REFRESH: "refresh",
  ECHO: "echo",
  TIME: "time",
  CONFIRM: "confirm",
} as const;

export const TELEGRAM_BOT_COMMANDS = [
  {
    command: TELEGRAM_PING_COMMAND_NAME,
    description: TELEGRAM_PING_COMMAND_DESCRIPTION,
  },
  {
    command: TELEGRAM_INFO_COMMAND_NAME,
    description: TELEGRAM_INFO_COMMAND_DESCRIPTION,
  },
  {
    command: TELEGRAM_HELP_COMMAND_NAME,
    description: TELEGRAM_HELP_COMMAND_DESCRIPTION,
  },
  {
    command: TELEGRAM_BUTTONS_COMMAND_NAME,
    description: TELEGRAM_BUTTONS_COMMAND_DESCRIPTION,
  },
  {
    command: TELEGRAM_NAME_COMMAND_NAME,
    description: TELEGRAM_NAME_COMMAND_DESCRIPTION,
  },
  {
    command: TELEGRAM_PROFILE_COMMAND_NAME,
    description: TELEGRAM_PROFILE_COMMAND_DESCRIPTION,
  },
];
