// `neon deploy` and `neon env pull` write .env.local
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
