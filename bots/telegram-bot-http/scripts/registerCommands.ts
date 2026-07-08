import { getTelegramBotToken } from "../src/env.js";
import { registerTelegramCommands } from "../src/utils/telegramApi.js";

const result = await registerTelegramCommands(getTelegramBotToken());

console.log(JSON.stringify(result, null, 2));
