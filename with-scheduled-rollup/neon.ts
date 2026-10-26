import { defineConfig } from "@neon/config/v1";
import { migrate } from "./scripts/migrate.ts";
import { smokeTest } from "./scripts/smoke-test.ts";

export default defineConfig({
  functions: {
    rollup: {
      name: "Daily rollup",
      source: "src/index.ts",
      env: {
        // Generated into .env.local at install. Your backend sends it as a Bearer token.
        ROLLUP_API_KEY: process.env.ROLLUP_API_KEY!,
      },
    },
  },
  triggers: {
    "daily-rollup": {
      type: "schedule",
      function: "rollup",
      // Daily at 00:05 UTC. Set ROLLUP_CRON in .env.local to change it.
      cron: process.env.ROLLUP_CRON || "5 0 * * *",
      functionPath: "/schedule",
    },
  },
  experimental: {
    hooks: {
      deploy: {
        // Runs after every `neon deploy`: apply new migrations, then check the
        // deployed function answers with this key.
        after: async ({ env }) => {
          await migrate(env.postgres.databaseUrlUnpooled);
          const url = env.functions?.rollup?.baseUrl;
          if (!url) throw new Error("The rollup function has no URL yet");
          await smokeTest(url, process.env.ROLLUP_API_KEY ?? "");
        },
      },
    },
  },
});
