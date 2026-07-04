import { parseEnv } from "@neon/env";
import neonConfig from "../neon.js";

let telegramEnv: ReturnType<typeof readTelegramEnv> | undefined;
let databaseUrl: string | undefined;

const readTelegramEnv = () => parseEnv(neonConfig, "telegram").function;

export const getTelegramEnv = () => {
  telegramEnv ??= readTelegramEnv();

  return telegramEnv;
};

export const getTelegramBotToken = () => {
  const botToken = getTelegramEnv().TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required.");
  }

  return botToken;
};

export const getTelegramWebhookSecret = () => getTelegramEnv().TELEGRAM_WEBHOOK_SECRET;

export const getDatabaseUrl = () => {
  databaseUrl ??= parseEnv(neonConfig, ["DATABASE_URL"]).postgres.databaseUrl;

  return databaseUrl;
};
