import { defineConfig } from "@neon/config/v1";
import { migrate } from "./scripts/migrate.ts";
import { smokeTest } from "./scripts/smoke-test.ts";

export default defineConfig({
  functions: {
    queue: {
      name: "Queue",
      source: "src/index.ts",
      env: {
        // Generated into .env.local at install. Your backend sends it as a Bearer token.
        QUEUE_API_KEY: process.env.QUEUE_API_KEY!,
      },
    },
  },
  experimental: {
    hooks: {
      deploy: {
        // Runs after every `neon deploy`: apply new migrations, then check the
        // deployed function answers with this key.
        after: async ({ env }) => {
          await migrate(env.postgres.databaseUrlUnpooled);
          const url = env.functions?.queue?.baseUrl;
          if (!url) throw new Error("The queue function has no URL yet");
          await smokeTest(url, process.env.QUEUE_API_KEY ?? "");
        },
      },
    },
  },
});
