import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  VerifyWhatsAppRequestInput,
  VerifyWhatsAppWebhookChallengeInput,
} from "../types/whatsapp.js";

export const verifyWhatsAppRequest = ({
  appSecret,
  body,
  signature,
}: VerifyWhatsAppRequestInput): boolean => {
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
}: VerifyWhatsAppWebhookChallengeInput): boolean => mode === "subscribe" && Boolean(verifyToken) && token === verifyToken;
