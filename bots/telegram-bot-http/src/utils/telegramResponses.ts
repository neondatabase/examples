import { TELEGRAM_DB_RESPONSE_DEADLINE_MS } from "../constants/telegram.js";
import type { TelegramMessage, TelegramOutboundMessage } from "../types/telegram.js";
import { escapeTelegramHtml } from "./telegramText.js";

const getTelegramMessageLatencyMs = (message: TelegramMessage): number | undefined => {
  if (!message.date) {
    return undefined;
  }

  return Math.max(0, Date.now() - message.date * 1000);
};

const formatLatency = (latencyMs: number | undefined): string =>
  latencyMs === undefined ? "latency unavailable" : `<b>${latencyMs}</b>ms latency`;

export const createErrorMessage = (
  chatId: TelegramOutboundMessage["chatId"],
  description: string,
): TelegramOutboundMessage => ({
  chatId,
  text: ["<b>Something went wrong</b>", escapeTelegramHtml(description)].join("\n"),
});

export const withResponseDeadline = (
  work: Promise<TelegramOutboundMessage>,
  fallback: () => TelegramOutboundMessage,
): Promise<TelegramOutboundMessage> => {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<TelegramOutboundMessage>((resolve) => {
    timer = setTimeout(() => resolve(fallback()), TELEGRAM_DB_RESPONSE_DEADLINE_MS);
  });

  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
};

export const createWarmingUpMessage = (chatId: TelegramOutboundMessage["chatId"]): TelegramOutboundMessage => ({
  chatId,
  text: [
    "<b>Warming up</b>",
    "The database is warming up (Neon scales to zero when idle). Please run the command again in a moment.",
  ].join("\n"),
});

export const createPingMessage = (
  chatId: TelegramOutboundMessage["chatId"],
  message: TelegramMessage,
): TelegramOutboundMessage => ({
  chatId,
  text: [
    "<b>Pong</b>",
    `Neon Functions replied with ${formatLatency(getTelegramMessageLatencyMs(message))}.`,
  ].join("\n"),
});
