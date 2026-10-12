import { parseEnv } from "@neon/env";

import neonConfig from "../neon";
import "./load-env";

export const env = parseEnv(neonConfig, [
  "DATABASE_URL",
  "NEON_REALTIME_URL",
  "NEON_REALTIME_SECRET",
  "NEON_REALTIME_DATABASE_NAME",
]);
