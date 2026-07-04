import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    functions: {
      discord: {
        name: "Discord interactions",
        source: "./functions/discord.ts",
        env: {
          DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY,
          DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,
          DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
          ...(process.env.DISCORD_GUILD_ID ? { DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID } : {}),
        },
        dev: {
          port: 8787,
        },
      },
    },
  },
});
