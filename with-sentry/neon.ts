import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    aiGateway: true,
    functions: {
      withsentry: {
        name: "with sentry",
        source: "src/index.ts",
        env: {
          SENTRY_DSN: process.env.SENTRY_DSN!,
          SENTRY_RELEASE: process.env.SENTRY_RELEASE ?? "",
          SENTRY_TRACES_SAMPLE_RATE: process.env.SENTRY_TRACES_SAMPLE_RATE ?? "1",
          PRODUCTION_BRANCH: process.env.PRODUCTION_BRANCH ?? "",
        },
      },
    },
  },
});
