import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  functions: {
    discord: {
      name: "Discord interactions",
      source: "./functions/discord.ts",
      env: {
        DISCORD_PUBLIC_KEY: { value: process.env.DISCORD_PUBLIC_KEY, required: true },
        DISCORD_APPLICATION_ID: { value: process.env.DISCORD_APPLICATION_ID, required: true },
        DISCORD_BOT_TOKEN: { value: process.env.DISCORD_BOT_TOKEN, required: true },
        DISCORD_GUILD_ID: { value: process.env.DISCORD_GUILD_ID, required: false, onUndefined: "skip" },
      },
      dev: {
        port: 8787,
      },
    },
  },
});
