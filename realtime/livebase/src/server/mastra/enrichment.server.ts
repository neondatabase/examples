import { Agent, type ToolsInput } from "@mastra/core/agent";

import { AGENT_IDS } from "~/lib/constants";
import { truncate } from "~/lib/format";
import type { EnrichmentContext, LeadRef } from "~/lib/types";
import { RunBudget } from "~/server/enrichment/budget";
import { enrichmentKeys, type EnrichmentKeys } from "~/server/enrichment/config";
import { ENRICHMENT_INSTRUCTIONS, enrichmentPrompt } from "~/server/enrichment/prompt";
import { recordTools, type RecordToolDeps } from "~/server/enrichment/record-tools.server";
import { companyTools } from "~/server/enrichment/tools/company";
import { peopleTools } from "~/server/enrichment/tools/people";
import { searchTools } from "~/server/enrichment/tools/search";
import { checkImageUrl } from "~/server/enrichment/web/image";
import { persistColleague, persistFinding } from "~/server/persist.server";

// `mastra.server.ts` imports this module too. The cycle is safe because each
// side only uses the other inside functions, never at load time.
import { getMastra, recordAbortedRun, recordRunError } from "./mastra.server";
import { modelCallError } from "./model-errors";
import { ENRICHMENT_MODEL, modelCostUsd, type ModelUsage } from "./models";
import { getMemory } from "./storage.server";

// The enrichment agent. Its tools are built per run around the run's budget and
// passed as a per-call toolset, so it has none of its own.
export const enrichmentAgent = new Agent({
  id: AGENT_IDS.enrichment,
  name: "Enrichment agent",
  instructions: ENRICHMENT_INSTRUCTIONS,
  model: ENRICHMENT_MODEL,
  memory: getMemory(),
  // Mastra retries only the model call, so no tool re-runs. It honours
  // Retry-After up to 30 s and otherwise backs off 1, 2, 4 and 8 s. The default
  // is no retries, and one gateway 429 failed the lead.
  maxRetries: 4,
});

// The hard backstop, as a multiple of the cost cap. At the cap itself the run
// winds down gracefully; this only catches a step that overshoots badly.
const COST_BACKSTOP_FACTOR = 2;

// The wrap-up step's system note. It runs with recordFinding only, so a
// run stopped by its budget still scores the lead and suggests a next step.
export const WRAP_UP_NOTE =
  "Your research budget is spent. Record lead.fit_score and lead.next_step now with recordFinding, if you " +
  "haven't yet. No other tools are available, and the next step has none, so then write your summary.";

const RECORD_DEPS: RecordToolDeps = { persistFinding, persistColleague, checkImageUrl };

interface ToolsTarget extends LeadRef {
  readonly email: string | null;
  readonly companyId: string | null;
}

// Every tool for one run. A tool whose key is missing isn't registered, and
// Gravatar needs the lead's email.
function enrichmentTools(
  budget: RunBudget,
  keys: EnrichmentKeys,
  target: ToolsTarget,
  onDatabaseError: (error: Error) => void,
): ToolsInput {
  const { leadId, workspaceId, email, companyId } = target;
  const tools: ToolsInput = {
    ...companyTools(budget),
    ...searchTools(budget, keys),
    ...peopleTools(budget, keys, { email }),
    ...recordTools({ leadId, workspaceId, budget, companyId, onDatabaseError }, RECORD_DEPS),
  };
  return tools;
}

// Logs which tools enrichment has, once per process. It names the
// variables, never their values.
export function logEnrichmentTools(keys: EnrichmentKeys = enrichmentKeys()): void {
  const flag = globalThis as typeof globalThis & { livebaseEnrichmentToolsLogged?: boolean };
  if (flag.livebaseEnrichmentToolsLogged) return;
  flag.livebaseEnrichmentToolsLogged = true;
  const budget = new RunBudget(new AbortController().signal);
  const target = { leadId: "", workspaceId: "", email: "someone@example.com", companyId: null };
  const names = Object.keys(enrichmentTools(budget, keys, target, () => {}));
  const off = [
    keys.exaApiKey ? null : "webSearch (set EXA_API_KEY)",
    keys.xBearerToken ? null : "lookupXProfile (set X_BEARER_TOKEN)",
  ].filter((name) => name !== null);
  const gravatar = keys.gravatarApiKey ? "with full profiles" : "public avatar only; set GRAVATAR_API_KEY for profiles";
  console.info(
    `[enrichment] model ${ENRICHMENT_MODEL}; tools: ${names.join(", ")}` +
      (off.length > 0 ? `; off: ${off.join(", ")}` : "") +
      `. lookupGravatar runs only for leads with an email (${gravatar}).`,
  );
}

/**
 * Enriches a lead's company and person in the background, as one
 * agent call.
 *
 * - The agent is `enrichmentAgent` (`AGENT_IDS.enrichment`, `ENRICHMENT_MODEL`),
 *   registered in `mastra.server.ts` and fetched with `getMastra().getAgent()`,
 *   so it runs with Mastra's storage and tracing, and its root span carries the
 *   lead's `threadId`.
 * - The call passes `memory: { thread: leadId, resource: workspaceId }`,
 *   `savePerStep: true` and `maxSteps: RUN_LIMITS.maxSteps`. The
 *   run's tools are a per-call toolset built around one `RunBudget`,
 *   whose signal is `context.signal` combined with the run's own budget
 *   controller. That combined signal is `generate`'s `abortSignal`, so a
 *   cancel, timeout or budget abort stops the model call and every fetch.
 * - The record tools write each finding as soon as the model reports it
 *  , with the run's trace ID and a source URL where one exists
 *  . Every write is conditional on the lead still existing,
 *   belonging to the workspace, and not being archived.
 * - Tool results reach the model cut to `RUN_LIMITS.toolResultBytes`,
 *   and the stored messages keep only `toolTranscript()`'s summary.
 * - Error policy:
 *   - research tools turn expected failures (HTTP errors, refusals, timeouts,
 *     a spent budget, no match) into `{ ok: false, error }` results the model
 *     reads;
 *   - a record tool's database error is kept, aborts the run, and is thrown
 *     here after `generate` returns, recorded on the root span, so the lead
 *     fails. Mastra would otherwise hand a thrown tool error to the model and
 *     carry on;
 *   - abort errors always propagate;
 *   - a model call that still fails after its retries goes through
 *     `modelCallError`, so the lead fails with a short status detail.
 * - Cost. Model cost is charged from each completed step's usage in
 *   `prepareStep`, which sees the steps before the next model call;
 *   `onStepFinish` lags behind the loop under `savePerStep`. Exa and X
 *   charge their own calls. The run winds down in two steps instead of being
 *   cut off. Once the cost cap is reached, or on the second-to-last
 *   allowed step, the next step is a wrap-up: only `recordFinding`, with
 *   `WRAP_UP_NOTE` added to the system messages, so the lead still gets its
 *   fit score and next step. Every step after it runs with
 *   `toolChoice: "none"`, so the model writes its summary. At twice the cap the
 *   run is aborted as a backstop, recorded on the root span as a failure.
 * - Each run logs one line with its outcome, time, steps and cost by source,
 *   including a run whose model call failed.
 * - An aborted call resolves rather than throws, with `finishReason`
 *   "aborted" or "tool-calls", so the outcome comes from the signals.
 *   When `context.signal` is aborted, `recordAbortedRun` marks the run
 *   cancelled or timed out and the abort is rethrown, as `extractLead` does
 *  .
 */
export async function enrichLead(context: EnrichmentContext): Promise<void> {
  const { signal, ...snapshot } = context;
  const { leadId, workspaceId, person, company, rawText } = snapshot;
  signal.throwIfAborted();

  // The run's own abort, for a database error or the cost backstop. The
  // first failure wins; later ones are side effects of the abort. The signal's
  // reason is a plain AbortError, and the real error stays in `failure`, so
  // research tools running alongside show as stopped rather than as failing
  // with someone else's error.
  const budgetController = new AbortController();
  let failure: Error | null = null;
  const fail = (error: Error) => {
    failure ??= error;
    budgetController.abort(new DOMException(`Enrichment stopped: ${error.message}`, "AbortError"));
  };
  const budget = new RunBudget(AbortSignal.any([signal, budgetController.signal]));
  const tools = enrichmentTools(
    budget,
    enrichmentKeys(),
    { leadId, workspaceId, email: person?.email ?? null, companyId: company?.id ?? null },
    fail,
  );

  // Charges each completed step once, from the loop's own `steps`.
  let charged = 0;
  const charge = (steps: readonly { readonly usage?: ModelUsage }[]) => {
    for (; charged < steps.length; charged++) budget.addCost("model", modelCostUsd(steps[charged].usage));
  };
  const { maxSteps, maxCostUsd } = budget.limits;
  const backstopUsd = maxCostUsd * COST_BACKSTOP_FACTOR;
  const lastStep = maxSteps - 1;
  let wrappedUp = false;
  const outcome = (finishReason?: string) => (failure ? "failed" : signal.aborted ? "aborted" : finishReason);

  const agent = getMastra().getAgent("enrichmentAgent");
  const result = await agent.generate(enrichmentPrompt(snapshot, Object.keys(tools)), {
    // As extraction: the thread is the lead and the resource is the workspace,
    // so live queries scope the rows. Extraction has usually created the thread
    // already, and an existing title is kept.
    memory: {
      thread: {
        id: leadId,
        title: truncate(rawText.replace(/\s+/g, " ").trim(), 80),
        metadata: { leadId },
      },
      resource: workspaceId,
    },
    toolsets: { enrichment: tools },
    maxSteps,
    savePerStep: true,
    abortSignal: budget.signal,
    prepareStep: ({ stepNumber, steps, systemMessages }) => {
      charge(steps);
      if (budget.costUsd >= backstopUsd) {
        fail(new Error(`Stopped at the cost backstop: $${budget.costUsd.toFixed(2)} spent against a $${maxCostUsd.toFixed(2)} cap`));
        return undefined;
      }
      // No tools, so the model sums up rather than starting more work.
      if (wrappedUp || stepNumber >= lastStep) return { toolChoice: "none" };
      if (budget.costSpent || stepNumber === lastStep - 1) {
        wrappedUp = true;
        return {
          activeTools: ["recordFinding"],
          systemMessages: [...systemMessages, { role: "system", content: WRAP_UP_NOTE }],
        };
      }
      return undefined;
    },
  }).catch((error: unknown) => {
    // `generate` throws a failed model call's error, after its retries. The
    // run's line is logged first, so its cost so far isn't lost.
    logRun(leadId, budget, charged, undefined, outcome("failed"));
    // A database error or the backstop aborted the run: that error is the
    // lead's, not the abort it caused. `generate` resolved on every
    // abort in testing, so this is a guard.
    if (failure) throw failure;
    throw error instanceof Error ? modelCallError(error) : error;
  });

  // An aborted run never reaches another `prepareStep`.
  charge(result.steps);
  logRun(leadId, budget, result.steps.length, result.traceId, outcome(result.finishReason));

  if (failure) {
    await recordRunError(result, failure);
    throw failure;
  }
  if (signal.aborted) {
    await recordAbortedRun(result, signal);
    signal.throwIfAborted();
  }
  if (result.error) {
    throw result.error instanceof Error ? modelCallError(result.error) : new Error(String(result.error));
  }
}

// One line per run, for checking time and cost against the budget.
function logRun(
  leadId: string,
  budget: RunBudget,
  steps: number,
  traceId: string | undefined,
  outcome: string | undefined,
): void {
  const costs = Object.entries(budget.costBySource())
    .map(([source, usd]) => `${source} $${usd.toFixed(3)}`)
    .join(", ");
  const calls = (["search", "read", "image", "lookup", "x", "colleague"] as const)
    .map((kind) => `${kind} ${budget.used(kind)}`)
    .join(", ");
  console.info(
    `[enrichment] lead ${leadId} ${outcome ?? "done"} in ${(budget.elapsedMs() / 1000).toFixed(1)} s: ` +
      `${steps} steps, $${budget.costUsd.toFixed(3)}${costs ? ` (${costs})` : ""}; calls: ${calls}` +
      (traceId ? `; trace ${traceId}` : ""),
  );
}
