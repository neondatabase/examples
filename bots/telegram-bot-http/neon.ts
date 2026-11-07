import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  functions: {
    telegram: {
      name: "Telegram webhook",
      source: "./functions/telegram.ts",
      env: {
        TELEGRAM_BOT_TOKEN: { value: process.env.TELEGRAM_BOT_TOKEN, required: true },
        TELEGRAM_WEBHOOK_SECRET: { value: process.env.TELEGRAM_WEBHOOK_SECRET, required: true },
      },
      dev: {
        port: 8787,
      },
    },
  },
});
