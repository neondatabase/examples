import { parseEnv } from "@neon/env";
import neonConfig from "../neon.js";

let databaseUrl: string | undefined;

export const getDatabaseUrl = () => {
  databaseUrl ??= parseEnv(neonConfig, ["DATABASE_URL"]).postgres.databaseUrl;

  return databaseUrl;
};
