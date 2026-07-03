import { registerDiscordCommandsInputSchema } from "../src/schemas/discord.js";
import { getDiscordEnv } from "../src/env.js";
import { registerDiscordCommands } from "../src/utils/discordApi.js";

const env = getDiscordEnv();
const parsedInput = registerDiscordCommandsInputSchema.safeParse({
  applicationId: env.DISCORD_APPLICATION_ID,
  botToken: env.DISCORD_BOT_TOKEN,
  guildId: env.DISCORD_GUILD_ID,
});

if (!parsedInput.success) {
  throw new Error(`Invalid Discord command registration environment: ${parsedInput.error.message}`);
}

const commands = await registerDiscordCommands(parsedInput.data);

console.log(JSON.stringify(commands, null, 2));
