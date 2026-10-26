import { defineConfig } from "@neon/config/v1";
import { migrate } from "./scripts/migrate.ts";
import { smokeTest } from "./scripts/smoke-test.ts";

const bucket = "images";

export default defineConfig({
  aiGateway: true,
  buckets: {
    [bucket]: { access: "private" },
  },
  functions: {
    insights: {
      name: "Image insights",
      source: "src/index.ts",
      env: {
        // Generated into .env.local at install. Your backend sends it as a Bearer token.
        INSIGHTS_API_KEY: process.env.INSIGHTS_API_KEY!,
        IMAGES_BUCKET: bucket,
        IMAGE_MODEL: process.env.IMAGE_MODEL || "claude-haiku-4-5",
      },
    },
  },
  triggers: {
    "image-uploaded": {
      type: "storage_object_created",
      function: "insights",
      bucket,
      prefix: "uploads/",
      functionPath: "/object-created",
    },
  },
  experimental: {
    hooks: {
      deploy: {
        // Runs after every `neon deploy`: apply new migrations, then check the
        // function answers and can reach the bucket and the model.
        after: async ({ env }) => {
          await migrate(env.postgres.databaseUrlUnpooled);
          const url = env.functions?.insights?.baseUrl;
          if (!url) throw new Error("The insights function has no URL yet");
          await smokeTest(url, process.env.INSIGHTS_API_KEY ?? "");
        },
      },
    },
  },
});
