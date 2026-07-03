import { defineConfig } from "@neon/config/v1";

const discordPublicKey = process.env.DISCORD_PUBLIC_KEY;
const discordApplicationId = process.env.DISCORD_APPLICATION_ID;
const discordBotToken = process.env.DISCORD_BOT_TOKEN;
const discordGuildId = process.env.DISCORD_GUILD_ID;

if (!discordPublicKey) {
  throw new Error("DISCORD_PUBLIC_KEY is required to deploy the Discord interactions function.");
}

export default defineConfig({
  preview: {
    functions: {
      discord: {
        name: "Discord interactions",
        source: "./functions/discord.ts",
        env: {
          DISCORD_PUBLIC_KEY: discordPublicKey,
          ...(discordApplicationId ? { DISCORD_APPLICATION_ID: discordApplicationId } : {}),
          ...(discordBotToken ? { DISCORD_BOT_TOKEN: discordBotToken } : {}),
          ...(discordGuildId ? { DISCORD_GUILD_ID: discordGuildId } : {}),
        },
        dev: {
          port: 8787,
        },
      },
    },
  },
});
