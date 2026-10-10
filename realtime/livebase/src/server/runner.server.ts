import { logEnrichmentTools } from "~/server/mastra/enrichment.server";

import { failInterruptedLeads } from "./persist.server";
import { markLeadFailed, runEnrichment, runExtraction } from "./pipeline.server";
import { createRunner, type Runner, type RunnerOptions } from "./runner";

export type { Runner } from "./runner";

// Wires the runner in `./runner` to the real pipeline and database.

const RUNNER_OPTIONS: RunnerOptions = {
  restartDebounceMs: 1_500,
  extractionTimeoutMs: 30_000,
  // The whole enrichment run, model retries included.
  enrichmentTimeoutMs: 180_000,
  // Each run makes up to 30 model calls through the gateway. A test run at a
  // higher concurrency lost about 40% of its runs to rate limits, and the demo
  // needs three leads enriching at once.
  maxConcurrentEnrichments: 4,
};

// One runner per process. It lives on globalThis so that a dev-server module
// reload can't create a second runner whose startup sweep would fail the
// first runner's in-flight leads.
const globalRunner = globalThis as typeof globalThis & { livebaseRunner?: Runner };

export function getRunner(): Runner {
  // The first request builds the runner, so this is effectively server start.
  if (!globalRunner.livebaseRunner) logEnrichmentTools();
  globalRunner.livebaseRunner ??= createRunner(
    { runExtraction, runEnrichment, markLeadFailed, failInterruptedLeads },
    RUNNER_OPTIONS,
  );
  return globalRunner.livebaseRunner;
}
