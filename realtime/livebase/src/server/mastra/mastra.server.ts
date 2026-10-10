import {
  ConsoleLogger,
  LogLevel,
  type ConsoleLoggerOptions,
  type LoggerAdapterContext,
  type RegisteredLogger,
} from "@mastra/core/logger";
import { Mastra } from "@mastra/core/mastra";
import { SpanType } from "@mastra/core/observability";
import { MastraStorageExporter, Observability } from "@mastra/observability";
import { eq } from "drizzle-orm";

import { mastraAiSpans } from "~/db/mastra-schema";
import { truncate } from "~/lib/format";
import { db } from "~/server/db.server";
import { logDetail } from "~/server/runner";

import { enrichmentAgent } from "./enrichment.server";
import { extractionAgent } from "./extraction-agent.server";
import { getMemory, getStore } from "./storage.server";

// Mastra's default logger, a `ConsoleLogger` at INFO outside production,
// prints a failed model call's whole provider error, once per failed call:
// `[AGENT] Upstream LLM API error` with the AI SDK's `APICallError`, which
// carries the gateway URL and the request body, so the lead's input too
// (about 20 KB a call). This logger prints warnings and errors only,
// and cuts every argument to a one-line summary. The runner logs each lead's
// failure itself (`logDetail` in `runner.ts`).
//
// It's a `ConsoleLogger`, so Mastra still attaches trace correlation and log
// export to it in place (`@mastra/core` 1.68.0, `dist/mastra-LQln2tDj.js:3994`)
// rather than wrapping it in the deprecated `DualLogger`. Mastra hands each
// agent, store and workflow `logger.child({ component })`
// (`dist/base-B-BWYmtx.js:33`), and `ConsoleLogger.child` builds a plain
// `ConsoleLogger` (`dist/logger-DGUE8DHx.js:178`), so `child` is overridden
// to keep the summaries.
export class ConciseLogger extends ConsoleLogger {
  #adapter: LoggerAdapterContext | undefined;

  constructor(options: ConsoleLoggerOptions = {}) {
    super({ name: "Mastra", level: LogLevel.WARN, ...options });
  }

  override __attachObservability(context: LoggerAdapterContext): void {
    this.#adapter = context;
    super.__attachObservability(context);
  }

  override child(componentOrBindings: RegisteredLogger | Record<string, unknown>): ConciseLogger {
    const component =
      typeof componentOrBindings === "string"
        ? componentOrBindings
        : ((componentOrBindings.component as RegisteredLogger | undefined) ?? this.component);
    const child = new ConciseLogger({ name: this.name, level: this.level, component, filter: this.filter });
    if (this.#adapter) child.__attachObservability(this.#adapter);
    return child;
  }

  override debug(message: string, ...args: unknown[]): void {
    super.debug(conciseText(message, LOG_MESSAGE_CHARS), ...args.map(summarizeLogArg));
  }

  override info(message: string, ...args: unknown[]): void {
    super.info(conciseText(message, LOG_MESSAGE_CHARS), ...args.map(summarizeLogArg));
  }

  override warn(message: string, ...args: unknown[]): void {
    super.warn(conciseText(message, LOG_MESSAGE_CHARS), ...args.map(summarizeLogArg));
  }

  override error(message: string, ...args: unknown[]): void {
    super.error(conciseText(message, LOG_MESSAGE_CHARS), ...args.map(summarizeLogArg));
  }
}

const LOG_MESSAGE_CHARS = 500;
const LOG_VALUE_CHARS = 300;
const LOG_FIELDS = 12;

// One log argument as a short, one-line value. An error becomes its name,
// message and HTTP status, never its properties (an `APICallError`'s `url`,
// `requestBodyValues` and `responseBody`) or its stack. An object keeps its
// scalar fields and error summaries; nested objects and arrays are only
// named, because they may hold a request or a prompt.
export function summarizeLogArg(value: unknown): unknown {
  if (value === null || typeof value !== "object") return summarizeLogValue(value);
  if (value instanceof Error || Array.isArray(value)) return summarizeLogValue(value);
  const entries = Object.entries(value);
  const summary: Record<string, unknown> = {};
  for (const [key, field] of entries.slice(0, LOG_FIELDS)) summary[key] = summarizeLogValue(field);
  if (entries.length > LOG_FIELDS) summary.more = `${entries.length - LOG_FIELDS} more fields`;
  return summary;
}

function summarizeLogValue(value: unknown): unknown {
  if (value instanceof Error) return conciseText(logDetail(value), LOG_VALUE_CHARS);
  if (typeof value === "string") return conciseText(value, LOG_VALUE_CHARS);
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === "function") return "[function]";
  if (value !== null && typeof value === "object") return "[object]";
  return value;
}

function conciseText(text: string, max: number): string {
  return truncate(text.replace(/\s+/g, " ").trim(), max);
}

// `PostgresStore`'s observability store keeps spans only: its metric and log
// writes throw `_NOT_IMPLEMENTED`. The exporter then warns once per process
// ("This storage provider does not support batch creating metrics") and drops
// that signal. Every span end emits duration and token metrics, so the
// warning always appeared on the first run. This exporter doesn't buffer
// metrics or logs at all.
class SpanStorageExporter extends MastraStorageExporter {
  override async onMetricEvent(): Promise<void> {}
  override async onLogEvent(): Promise<void> {}
}

function createObservability(): Observability {
  return new Observability({
    configs: {
      default: {
        serviceName: "livebase",
        exporters: [
          // `batch-with-updates` inserts a span row when the span starts and
          // updates it when it ends, so the timeline shows running steps.
          // The default 5 s batch wait would make it lag; 250 ms keeps
          // each step within about a second of the UI.
          new SpanStorageExporter({ strategy: "batch-with-updates", maxBatchWaitMs: 250 }),
        ],
        // TEMPORARY: 2048 rather than 8192 keeps a span row small enough to
        // stay inline under the STORAGE MAIN workaround for a Neon Realtime bug
        // (see `keepSyncedValuesInline` in `setup.ts`). At 8192 a
        // 10,000-character note made 6.8 KB rows, close to the 8 KB page limit.
        // Go back to 8192 once Neon Realtime handles out-of-line values.
        serializationOptions: {
          maxStringLength: 2048,
          maxDepth: 6,
          maxArrayLength: 50,
          maxObjectKeys: 50,
        },
        // One span per streamed chunk would flood the table and the timeline.
        excludeSpanTypes: [SpanType.MODEL_CHUNK],
      },
    },
  });
}

function createMastra() {
  return new Mastra({
    // `src/realtime/runs.ts` tells the runs apart by these agents' IDs
    // (`AGENT_IDS`), so keep them stable.
    agents: { extractionAgent, enrichmentAgent },
    storage: getStore(),
    logger: new ConciseLogger(),
    observability: createObservability(),
  });
}

type LivebaseMastra = ReturnType<typeof createMastra>;

// Built once per process, so hot reload doesn't start a second exporter.
// Restart the dev server after editing an agent's instructions.
const globalMastra = globalThis as typeof globalThis & { livebaseMastra?: LivebaseMastra };

export function getMastra(): LivebaseMastra {
  const mastra = globalMastra.livebaseMastra ?? createMastra();
  globalMastra.livebaseMastra = mastra;
  return mastra;
}

// Deletes the lead's trace spans, and its thread and messages. Mastra's
// `deleteThread` leaves spans alone, so without this they would stay in the
// table and keep syncing to every browser. The two deletes are independent: a
// failure is logged, and the other delete still runs. Deleting a thread that
// doesn't exist is a no-op, so a lead that never reached the agent is fine. A
// span that a batch exporter writes after this is left for retention to delete.
export async function deleteLeadThread(leadId: string): Promise<void> {
  const [spans, thread] = await Promise.allSettled([
    db.delete(mastraAiSpans).where(eq(mastraAiSpans.threadId, leadId)),
    getMemory().deleteThread(leadId),
  ]);
  if (spans.status === "rejected") console.error(`Failed to delete the trace spans for lead ${leadId}`, spans.reason);
  if (thread.status === "rejected") console.error(`Failed to delete the Mastra thread for lead ${leadId}`, thread.reason);
}

// Records why an aborted agent run stopped, on its root span. Mastra ends an
// aborted run's root span normally, with `error` NULL. Only its `output` says
// it was aborted, and the spans projection leaves `output` out, so without this
// a cancelled or timed-out run would read as completed. The runner aborts with
// a `TimeoutError` reason when a stage runs out of time; any other abort is a
// cancel.
export async function recordAbortedRun(
  run: { traceId?: string; spanId?: string },
  signal: AbortSignal,
): Promise<void> {
  const timedOut = signal.reason instanceof Error && signal.reason.name === "TimeoutError";
  const error = timedOut
    ? { name: "TimeoutError", message: "Timed out" }
    : { name: "AbortError", message: "Cancelled" };
  await recordRunError(run, error);
}

// Records a failure on a run's root span that Mastra didn't see as one: an
// abort (above), or enrichment's own stop for a database error or the cost
// backstop, which aborts the call, so the span would also end with `error`
// NULL.
export async function recordRunError(
  run: { traceId?: string; spanId?: string },
  error: { readonly name: string; readonly message: string },
): Promise<void> {
  const { traceId, spanId } = run;
  // The run was aborted before it started a trace.
  if (!traceId || !spanId) return;
  try {
    // The exporter's own end-of-span update writes `error: null`, so it has
    // to land first.
    await getMastra().observability.flush();
    const observability = await getStore().getStore("observability");
    await observability?.updateSpan({
      traceId,
      spanId,
      updates: { error: { name: error.name, message: error.message } },
    });
  } catch (cause) {
    // The error still has to reach the runner, so a failed write only logs.
    console.error(`[mastra] could not record the error on run ${traceId}`, cause);
  }
}
