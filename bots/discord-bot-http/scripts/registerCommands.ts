import { registerDiscordCommandsInputSchema } from "../src/schemas/discord.js";
import { registerDiscordCommands } from "../src/utils/discordApi.js";

const parsedInput = registerDiscordCommandsInputSchema.safeParse({
  applicationId: process.env.DISCORD_APPLICATION_ID,
  botToken: process.env.DISCORD_BOT_TOKEN,
  guildId: process.env.DISCORD_GUILD_ID,
});

if (!parsedInput.success) {
  throw new Error(`Invalid Discord command registration environment: ${parsedInput.error.message}`);
}

const commands = await registerDiscordCommands(parsedInput.data);

console.log(JSON.stringify(commands, null, 2));
