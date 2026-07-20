import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  enableLogs: true,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 1),
  traceLifecycle: "stream",
  streamGenAiSpans: true,
  integrations: [
    // Deploy bundling defeats module detection — run the AI integration unconditionally.
    Sentry.vercelAIIntegration({ force: true }),
    // The request root span comes from the Hono middleware in index.ts.
    Sentry.httpIntegration({ disableIncomingRequestSpans: true }),
  ],
  release: process.env.SENTRY_RELEASE,
  // NEON_BRANCH holds the branch ID; the default branch reports as "production".
  environment:
    process.env.NEON_BRANCH && process.env.NEON_BRANCH !== process.env.PRODUCTION_BRANCH
      ? process.env.NEON_BRANCH
      : "production",
});

// The runtime signals before evicting an idle isolate — flush buffered telemetry.
process.on("SIGTERM", () => void Sentry.flush(2000));
process.on("SIGINT", () => void Sentry.flush(2000));

export { Sentry };
