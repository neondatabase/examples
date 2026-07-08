export const escapeTelegramHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export const parseTelegramCommand = (
  text: string | undefined,
): { name: string; args: string | undefined } | undefined => {
  if (!text?.startsWith("/")) {
    return undefined;
  }

  const match = text.match(/^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/);

  if (!match) {
    return undefined;
  }

  return {
    name: match[1].toLowerCase(),
    args: match[2],
  };
};
