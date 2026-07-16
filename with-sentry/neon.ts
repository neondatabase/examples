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
          PRODUCTION_BRANCH: process.env.PRODUCTION_BRANCH ?? "",
        },
      },
    },
  },
});
