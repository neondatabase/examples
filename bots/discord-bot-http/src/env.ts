import { parseEnv } from "@neon/env";
import neonConfig from "../neon.js";

let discordEnv: ReturnType<typeof readDiscordEnv> | undefined;
let databaseUrl: string | undefined;

const readDiscordEnv = () => parseEnv(neonConfig, "discord").function;

export const getDiscordEnv = () => {
  discordEnv ??= readDiscordEnv();

  return discordEnv;
};

export const getDatabaseUrl = () => {
  databaseUrl ??= parseEnv(neonConfig, ["DATABASE_URL"]).postgres.databaseUrl;

  return databaseUrl;
};
