import { parseEnv } from "@neon/env";
import neonConfig from "../neon.js";

const readTelegramEnv = () => parseEnv(neonConfig, "telegram").function;

export const getTelegramEnv = () => readTelegramEnv();

export const getTelegramBotToken = () => {
  const botToken = getTelegramEnv().TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required.");
  }

  return botToken;
};

export const getTelegramWebhookSecret = () => getTelegramEnv().TELEGRAM_WEBHOOK_SECRET;

export const getDatabaseUrl = () => parseEnv(neonConfig, ["DATABASE_URL"]).postgres.databaseUrl;
