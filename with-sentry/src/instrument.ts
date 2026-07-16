import * as Sentry from "@sentry/node";

// The Neon runtime creates the OpenTelemetry API global (its built-in telemetry) before
// user code loads — with its own @opentelemetry/api version. registerGlobal() requires an
// EXACT version match to write, so if the bundled api differs even by a patch version
// (e.g. runtime 1.9.0 vs bundle 1.9.1), every Sentry registration silently fails and all
// spans are non-recording — while errors and logs still work. trace.disable() is not
// enough (the version gate rejects the re-registration too); the global object itself has
// to go so Sentry's api copy can recreate it. Same class of issue as @sentry/deno on
// Supabase Edge Runtime (getsentry/sentry-javascript#19723).
delete (globalThis as Record<symbol, unknown>)[Symbol.for("opentelemetry.js.api.1")];

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  // Structured logs via Sentry.logger.* — off by default, so turn it on.
  enableLogs: true,
  // Agents are low-throughput and every trace is interesting, so default to 100%;
  // dial down via the env var if this function serves high-volume plain HTTP.
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 1),
  // Stream spans as they finish instead of holding the whole tree until the request ends.
  // With handlers that stream for minutes (SSE, WebSockets, agent loops) this means spans
  // survive isolate eviction and long traces don't blow past payload limits.
  traceLifecycle: (process.env.SENTRY_TRACE_LIFECYCLE as "stream" | "static") ?? "stream",
  // Default since @sentry/node 10.61 — gen_ai spans are sent as standalone items so large
  // prompts/outputs aren't truncated. Set to false only on self-hosted Sentry.
  streamGenAiSpans: true,
  integrations: [
    // neon deploy bundles the code, which defeats the integration's module detection —
    // force it so gen_ai span processing runs unconditionally.
    Sentry.vercelAIIntegration({ force: true }),
    // The request root span comes from the Hono middleware (with clean route names);
    // the runtime's internal server would otherwise add a duplicate "fn.local" span.
    Sentry.httpIntegration({ disableIncomingRequestSpans: true }),
  ],
  // Tag events with a release (e.g. the commit SHA) to unlock regression detection.
  release: process.env.SENTRY_RELEASE,
  // NEON_BRANCH (the branch name) is injected on EVERY branch, including the default — so it
  // can't be used as a truthy "is this a branch?" flag. Treat the project's default branch as
  // "production" (its name passed in via neon.ts env) and tag every other branch by its name.
  environment:
    process.env.NEON_BRANCH && process.env.NEON_BRANCH !== process.env.PRODUCTION_BRANCH
      ? process.env.NEON_BRANCH
      : "production",
});

// The runtime sends SIGTERM/SIGINT before evicting an idle isolate. Sentry buffers logs
// (up to 100) and batches envelopes, so flush on the way out or the tail gets dropped.
process.on("SIGTERM", () => void Sentry.flush(2000));
process.on("SIGINT", () => void Sentry.flush(2000));

export { Sentry };
