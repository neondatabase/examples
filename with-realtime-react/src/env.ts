import { parseEnv } from "@neon/env";

import neonConfig from "../neon.js";

export const env = parseEnv(neonConfig, [
  "DATABASE_URL",
  "NEON_REALTIME_URL",
  "NEON_REALTIME_SECRET",
  "NEON_REALTIME_DATABASE_NAME",
]);
