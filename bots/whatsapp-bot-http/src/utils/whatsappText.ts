import type { WhatsAppParsedCommand } from "../types/whatsapp.js";

export const parseWhatsAppCommand = (
  text: string | undefined,
): WhatsAppParsedCommand | undefined => {
  if (!text) {
    return undefined;
  }

  const trimmedText = text.trim();
  const match = trimmedText.match(/^\/?([A-Za-z0-9_]+)(?:\s+([\s\S]*))?$/);

  if (!match) {
    return undefined;
  }

  return {
    name: match[1].toLowerCase(),
    args: match[2],
  };
};
