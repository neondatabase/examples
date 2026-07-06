import {
  WHATSAPP_BOT_COMMANDS,
  WHATSAPP_BUTTON_TEST_ACTIONS,
  WHATSAPP_BUTTON_TEST_CALLBACK_PREFIX,
} from "../constants/whatsapp.js";
import type {
  WhatsAppButtonTestAction,
  WhatsAppInfoResponseInput,
  WhatsAppOutboundMessage,
  WhatsAppProfileResponseInput,
} from "../types/whatsapp.js";

const createButtonTestCallbackData = (action: WhatsAppButtonTestAction): string =>
  `${WHATSAPP_BUTTON_TEST_CALLBACK_PREFIX}:${action}`;

const formatButtonTimestamp = (date: Date): string =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(date);

export const createHelpMessage = (to: string): WhatsAppOutboundMessage => ({
  to,
  text: [
    "*Neon WhatsApp Bot Help*",
    "",
    ...WHATSAPP_BOT_COMMANDS.map((command) => `/${command.command} - ${command.description}`),
  ].join("\n"),
});

export const createInfoMessage = (
  to: string,
  { branch, functionUrl, method, platform, runtime }: WhatsAppInfoResponseInput,
): WhatsAppOutboundMessage => ({
  to,
  text: [
    "*Neon WhatsApp Bot Info*",
    "",
    `Runtime: ${runtime}`,
    `Platform: ${platform}`,
    `Request method: ${method}`,
    `Neon branch: ${branch}`,
    `Function URL: ${functionUrl}`,
  ].join("\n"),
});

export const createProfileMessage = (
  to: string,
  { name, totalRuns, usageLines }: WhatsAppProfileResponseInput,
): WhatsAppOutboundMessage => ({
  to,
  text: [
    "*Your Profile*",
    "",
    `Name: ${name ?? "not set"}`,
    `Total commands run: ${totalRuns}`,
    "Storage: Neon Postgres via Drizzle",
    "",
    "*Command usage*",
    ...usageLines,
  ].join("\n"),
});

export const createButtonTestMessage = (
  to: string,
  status = "Tap a button below to test WhatsApp interactive replies.",
): WhatsAppOutboundMessage => ({
  to,
  text: ["*Button Test*", status].join("\n"),
  buttons: [
    { id: createButtonTestCallbackData(WHATSAPP_BUTTON_TEST_ACTIONS.REFRESH), title: "Refresh" },
    { id: createButtonTestCallbackData(WHATSAPP_BUTTON_TEST_ACTIONS.ECHO), title: "Echo" },
    { id: createButtonTestCallbackData(WHATSAPP_BUTTON_TEST_ACTIONS.TIME), title: "Time" },
  ],
});

export const parseButtonTestCallbackData = (callbackData: string): WhatsAppButtonTestAction | undefined => {
  const [prefix, action] = callbackData.split(":");

  if (prefix !== WHATSAPP_BUTTON_TEST_CALLBACK_PREFIX) {
    return undefined;
  }

  switch (action) {
    case WHATSAPP_BUTTON_TEST_ACTIONS.REFRESH:
    case WHATSAPP_BUTTON_TEST_ACTIONS.ECHO:
    case WHATSAPP_BUTTON_TEST_ACTIONS.TIME:
      return action;
    default:
      return undefined;
  }
};

export const createButtonTestClickMessage = (
  to: string,
  action: WhatsAppButtonTestAction,
): WhatsAppOutboundMessage => {
  const clickedAt = formatButtonTimestamp(new Date());

  switch (action) {
    case WHATSAPP_BUTTON_TEST_ACTIONS.REFRESH:
      return createButtonTestMessage(to, `Refreshed at ${clickedAt} UTC.`);
    case WHATSAPP_BUTTON_TEST_ACTIONS.ECHO:
      return createButtonTestMessage(to, "Echo: WhatsApp interactive replies are working.");
    case WHATSAPP_BUTTON_TEST_ACTIONS.TIME:
      return createButtonTestMessage(to, `Current server time: ${clickedAt} UTC.`);
  }
};
