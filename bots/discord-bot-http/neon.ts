import { defineConfig } from "@neon/config/v1";

const discordPublicKey = process.env.DISCORD_PUBLIC_KEY;

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
        },
        dev: {
          port: 8787,
        },
      },
    },
  },
});
