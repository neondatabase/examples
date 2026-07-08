import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    functions: {
      telegram: {
        name: "Telegram webhook",
        source: "./functions/telegram.ts",
        env: {
          TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN!,
          TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET!,
        },
        dev: {
          port: 8787,
        },
      },
    },
  },
});
