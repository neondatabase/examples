import { createHmac, timingSafeEqual } from "node:crypto";

export const verifyWhatsAppRequest = ({
  appSecret,
  body,
  signature,
}: {
  appSecret: string | undefined;
  body: string;
  signature: string | null;
}): boolean => {
  if (!appSecret || !signature?.startsWith("sha256=")) {
    return false;
  }

  const expected = Buffer.from(
    `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`,
  );
  const actual = Buffer.from(signature);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

export const verifyWhatsAppWebhookChallenge = ({
  mode,
  token,
  verifyToken,
}: {
  mode: string | null;
  token: string | null;
  verifyToken: string | undefined;
}): boolean => mode === "subscribe" && Boolean(verifyToken) && token === verifyToken;
