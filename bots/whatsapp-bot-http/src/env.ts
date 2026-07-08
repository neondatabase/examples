import { parseEnv } from "@neon/env";
import neonConfig from "../neon.js";

const readWhatsAppEnv = () => parseEnv(neonConfig, "whatsapp").function;

export const getWhatsAppEnv = () => readWhatsAppEnv();

export const getWhatsAppAccessToken = () => {
  const accessToken = getWhatsAppEnv().WHATSAPP_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is required.");
  }

  return accessToken;
};

export const getWhatsAppPhoneNumberId = () => {
  const phoneNumberId = getWhatsAppEnv().WHATSAPP_PHONE_NUMBER_ID;

  if (!phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID is required.");
  }

  return phoneNumberId;
};

export const getWhatsAppVerifyToken = () => getWhatsAppEnv().WHATSAPP_VERIFY_TOKEN;

export const getWhatsAppAppSecret = () => getWhatsAppEnv().WHATSAPP_APP_SECRET;

export const getDatabaseUrl = () => parseEnv(neonConfig, ["DATABASE_URL"]).postgres.databaseUrl;
