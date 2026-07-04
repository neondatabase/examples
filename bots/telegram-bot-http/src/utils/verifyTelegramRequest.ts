import { timingSafeEqual } from "node:crypto";

export const verifyTelegramRequest = (secretToken: string | undefined, headerValue: string | null): boolean => {
  if (!secretToken || !headerValue) {
    return false;
  }

  const expected = Buffer.from(secretToken);
  const actual = Buffer.from(headerValue);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
};
