import { registerDiscordCommands } from "../src/utils/discordApi.js";

const applicationId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!applicationId) {
  throw new Error("DISCORD_APPLICATION_ID is required.");
}

if (!botToken) {
  throw new Error("DISCORD_BOT_TOKEN is required.");
}

const commands = await registerDiscordCommands({
  applicationId,
  botToken,
  guildId,
});

console.log(JSON.stringify(commands, null, 2));
