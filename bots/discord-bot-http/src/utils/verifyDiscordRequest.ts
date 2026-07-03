import { createPublicKey, verify } from "node:crypto";
import { DISCORD_SIGNATURE_PUBLIC_KEY_PREFIX } from "../constants/discord.js";

type VerifyDiscordRequestInput = {
  body: string;
  publicKey: string | undefined;
  signature: string | null;
  timestamp: string | null;
};

const isHex = (value: string) => /^[0-9a-f]+$/i.test(value);

const createDiscordPublicKey = (publicKey: string) =>
  createPublicKey({
    format: "der",
    key: Buffer.from(`${DISCORD_SIGNATURE_PUBLIC_KEY_PREFIX}${publicKey}`, "hex"),
    type: "spki",
  });

export const verifyDiscordRequest = ({
  body,
  publicKey,
  signature,
  timestamp,
}: VerifyDiscordRequestInput): boolean => {
  if (!publicKey || !signature || !timestamp) {
    return false;
  }

  if (publicKey.length !== 64 || signature.length !== 128) {
    return false;
  }

  if (!isHex(publicKey) || !isHex(signature)) {
    return false;
  }

  try {
    return verify(
      null,
      Buffer.from(`${timestamp}${body}`, "utf8"),
      createDiscordPublicKey(publicKey),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
};
