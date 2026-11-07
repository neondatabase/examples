import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    aiGateway: true,
    functions: {
      withsentry: {
        name: "with sentry",
        source: "src/index.ts",
        env: {
          SENTRY_DSN: { value: process.env.SENTRY_DSN, required: true },
          SENTRY_RELEASE: { value: process.env.SENTRY_RELEASE, required: false },
          SENTRY_TRACES_SAMPLE_RATE: {
            value: process.env.SENTRY_TRACES_SAMPLE_RATE ?? "1",
            required: true,
          },
          PRODUCTION_BRANCH: { value: process.env.PRODUCTION_BRANCH, required: false },
        },
      },
    },
  },
});
