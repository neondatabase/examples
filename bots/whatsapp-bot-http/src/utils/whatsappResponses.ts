import { WHATSAPP_DB_RESPONSE_DEADLINE_MS } from "../constants/whatsapp.js";
import type { WhatsAppMessage, WhatsAppOutboundMessage } from "../types/whatsapp.js";

const getWhatsAppMessageLatencyMs = (message: WhatsAppMessage): number | undefined => {
  if (!message.timestamp) {
    return undefined;
  }

  return Math.max(0, Date.now() - Number(message.timestamp) * 1000);
};

const formatLatency = (latencyMs: number | undefined): string =>
  latencyMs === undefined ? "latency unavailable" : `${latencyMs}ms latency`;

export const createErrorMessage = (to: string, description: string): WhatsAppOutboundMessage => ({
  to,
  text: [`*Something went wrong*`, description].join("\n"),
});

export const withResponseDeadline = (
  work: Promise<WhatsAppOutboundMessage>,
  fallback: () => WhatsAppOutboundMessage,
): Promise<WhatsAppOutboundMessage> => {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<WhatsAppOutboundMessage>((resolve) => {
    timer = setTimeout(() => resolve(fallback()), WHATSAPP_DB_RESPONSE_DEADLINE_MS);
  });

  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
};

export const createWarmingUpMessage = (to: string): WhatsAppOutboundMessage => ({
  to,
  text: [
    "*Warming up*",
    "The database is warming up (Neon scales to zero when idle). Please run the command again in a moment.",
  ].join("\n"),
});

export const createPingMessage = (to: string, message: WhatsAppMessage): WhatsAppOutboundMessage => ({
  to,
  text: ["*Pong*", `Neon Functions replied with ${formatLatency(getWhatsAppMessageLatencyMs(message))}.`].join(
    "\n",
  ),
});
