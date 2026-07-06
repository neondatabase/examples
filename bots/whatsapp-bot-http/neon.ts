import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    functions: {
      whatsapp: {
        name: "WhatsApp webhook",
        source: "./functions/whatsapp.ts",
        env: {
          WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN!,
          WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID!,
          WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN!,
          WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET!,
        },
        dev: {
          port: 8787,
        },
      },
    },
  },
});
