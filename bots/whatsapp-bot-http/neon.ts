import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  functions: {
    whatsapp: {
      name: "WhatsApp webhook",
      source: "./functions/whatsapp.ts",
      env: {
        WHATSAPP_ACCESS_TOKEN: { value: process.env.WHATSAPP_ACCESS_TOKEN, required: true },
        WHATSAPP_PHONE_NUMBER_ID: { value: process.env.WHATSAPP_PHONE_NUMBER_ID, required: true },
        WHATSAPP_VERIFY_TOKEN: { value: process.env.WHATSAPP_VERIFY_TOKEN, required: true },
        WHATSAPP_APP_SECRET: { value: process.env.WHATSAPP_APP_SECRET, required: true },
      },
      dev: {
        port: 8787,
      },
    },
  },
});
