import { parseEnv } from "@neon/env";
import neonConfig from "../neon.js";

let databaseUrl: string | undefined;

export const getDatabaseUrl = () => {
  databaseUrl ??= parseEnv(neonConfig, ["DATABASE_URL"]).postgres.databaseUrl;
  return databaseUrl;
};

const readStripeEnv = () => parseEnv(neonConfig, "stripe").function;

let stripeWebhookSecret: string | undefined;

export const getStripeWebhookSecret = () => {
  if (stripeWebhookSecret !== undefined) return stripeWebhookSecret;
  const secret = readStripeEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is required.");
  }
  stripeWebhookSecret = secret;
  return secret;
};
