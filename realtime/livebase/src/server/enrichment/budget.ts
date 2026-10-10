// Per-run limits for enrichment, the wrapper every research tool goes through,
// and the transcript transform every enrichment tool uses. Tools are built per
// run around one `RunBudget`, so each run has its own counters and cost, and
// every fetch gets the run's signal.
//
// The runner owns the wall-clock limit (`ENRICHMENT_TIMEOUT_MS`, 180 s) and
// the agent call owns `maxSteps`; this module only holds their values and
// counts tool calls and cost.

import { createTool, type ToolPayloadTransformFunction } from "@mastra/core/tools";
import type { z } from "zod";

import { truncate } from "~/lib/format";

export type BudgetKind = "search" | "read" | "image" | "lookup" | "x" | "colleague" | "free";
export type CountedKind = Exclude<BudgetKind, "free">;

export interface RunLimits {
  // Model steps per run (the agent's `maxSteps`).
  readonly maxSteps: number;
  // Model tokens plus provider calls, in USD.
  readonly maxCostUsd: number;
  // Every tool result is cut to this many bytes of JSON before the model
  // sees it. The stored message keeps only a summary.
  readonly toolResultBytes: number;
  // Calls per run for each counted kind.
  readonly calls: Readonly<Record<CountedKind, number>>;
}

export const RUN_LIMITS: RunLimits = {
  maxSteps: 30,
  maxCostUsd: 0.5,
  // 4 KB rather than 8 KB, for cost and latency: every step resends
  // the whole tool history to the model. It no longer guards the synced
  // `mastra_messages` row against TOAST (`keepSyncedValuesInline` in setup.ts):
  // a run's tool calls all merge into one assistant row, so no per-result cap
  // keeps it inline, and `toolTranscript()` stores a short summary instead of
  // the result. This cap measures affordability for the live pass.
  toolResultBytes: 4_000,
  calls: {
    // Exa searches.
    search: 6,
    // Page reads by `readWebPage`.
    read: 12,
    // Image checks by the record tools, which fetch a model-supplied URL
    // (avatar and logo candidates, and up to 6 colleague photos).
    // Kept apart from `read` so colleague photos can't starve page reads.
    image: 12,
    // Wikidata, DNS, `findCompanyWebsite` and Gravatar.
    lookup: 12,
    // X user lookups, which may be billed per call.
    x: 4,
    // Colleagues recorded (MAX_COLLEAGUES).
    colleague: 6,
  },
};

// What the model reads when a kind is spent. Each says what to do instead,
// so the run winds down rather than retrying.
const SPENT_MESSAGES: Readonly<Record<CountedKind, (limit: number) => string>> = {
  search: (n) => `Search budget spent (${n} searches). Record what you have and finish.`,
  read: (n) => `Page-read budget spent (${n} reads). Record what you have and finish.`,
  image: (n) => `Image-check budget spent (${n} checks). Record no more images.`,
  lookup: (n) => `Lookup budget spent (${n} lookups). Record what you have and finish.`,
  x: (n) => `X lookup budget spent (${n} lookups). Try another avatar method, or finish.`,
  colleague: (n) => `Colleague limit reached (${n} per run). Don't record more colleagues.`,
};

export class RunBudget {
  readonly signal: AbortSignal;
  readonly limits: RunLimits;
  readonly startedAt: number = Date.now();
  private readonly counts: Record<CountedKind, number> = { search: 0, read: 0, image: 0, lookup: 0, x: 0, colleague: 0 };
  private readonly costs: Record<string, number> = {};
  private total = 0;

  // `signal` is the run's: tools pass it to every fetch, so cancel, timeout
  // and restart-on-edit (owned by the runner) stop in-flight requests.
  constructor(signal: AbortSignal, limits: RunLimits = RUN_LIMITS) {
    this.signal = signal;
    this.limits = limits;
  }

  elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  // Grants one call (returns null), or returns a message for the model when
  // that kind is spent. Once the cost cap is reached, every counted kind is
  // refused. "free" is always granted.
  take(kind: BudgetKind): string | null {
    if (kind === "free") return null;
    if (this.costSpent) {
      return `Cost budget spent ($${this.limits.maxCostUsd.toFixed(2)}). Record what you have and finish.`;
    }
    const limit = this.limits.calls[kind];
    if (this.counts[kind] >= limit) return SPENT_MESSAGES[kind](limit);
    this.counts[kind] += 1;
    return null;
  }

  used(kind: CountedKind): number {
    return this.counts[kind];
  }

  // Adds a provider's or the model's cost ("model", "exa", "x", …). Ignores
  // anything that isn't a finite, positive amount, so a missing price can't
  // poison the total.
  addCost(source: string, usd: number): void {
    if (!Number.isFinite(usd) || usd <= 0) return;
    this.costs[source] = (this.costs[source] ?? 0) + usd;
    this.total += usd;
  }

  get costUsd(): number {
    return this.total;
  }

  get costSpent(): boolean {
    return this.total >= this.limits.maxCostUsd;
  }

  costBySource(): Readonly<Record<string, number>> {
    return { ...this.costs };
  }
}

const MIN_KEPT_CHARS = 40;
const TRUNCATION_MARK = "…[truncated]";

// Shortens the longest strings in a JSON-compatible value until its JSON
// encoding fits in `maxBytes`, then drops trailing items from the longest
// arrays. As a last resort it returns `{ truncated: true, json }` with a
// prefix of the encoding, sized so the wrapper itself fits too. The value is
// copied through JSON first, which is what the model receives anyway.
export function fitToBytes(value: unknown, maxBytes: number): unknown {
  const json = JSON.stringify(value);
  if (json === undefined) return value;
  if (Buffer.byteLength(json) <= maxBytes) return JSON.parse(json);
  const copy: unknown = JSON.parse(json);
  for (let i = 0; i < 200; i++) {
    const size = byteSize(copy);
    if (size <= maxBytes) return copy;
    const longest = findLongest(copy, "string");
    if (longest && longest.value.length > MIN_KEPT_CHARS * 2) {
      const keep = Math.max(MIN_KEPT_CHARS, longest.value.length - (size - maxBytes) - TRUNCATION_MARK.length - 8);
      longest.set(`${sliceChars(longest.value, keep)}${TRUNCATION_MARK}`);
      continue;
    }
    const array = findLongest(copy, "array");
    if (!array || array.value.length <= 1) break;
    array.value.splice(Math.ceil(array.value.length / 2));
  }
  if (byteSize(copy) <= maxBytes) return copy;
  return truncatedJson(json, maxBytes);
}

function byteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? "");
}

// Escaping inside the wrapper makes it longer than the prefix, so shrink the
// prefix until the wrapper fits.
function truncatedJson(json: string, maxBytes: number): unknown {
  let chars = Math.max(0, maxBytes - 50);
  for (;;) {
    const wrapper = { truncated: true, json: sliceChars(json, chars) };
    const over = byteSize(wrapper) - maxBytes;
    if (over <= 0 || chars === 0) return wrapper;
    chars = Math.max(0, chars - Math.max(over, 16));
  }
}

// One code point may take several bytes, so work in characters but never cut
// a surrogate pair in half.
function sliceChars(text: string, end: number): string {
  let cut = Math.min(end, text.length);
  const last = text.charCodeAt(cut - 1);
  if (cut > 0 && last >= 0xd800 && last <= 0xdbff) cut -= 1;
  return text.slice(0, cut);
}

type Found<T> = { readonly value: T; readonly set: (next: T) => void };

function findLongest(root: unknown, kind: "string"): Found<string> | undefined;
function findLongest(root: unknown, kind: "array"): Found<unknown[]> | undefined;
function findLongest(root: unknown, kind: "string" | "array"): Found<string> | Found<unknown[]> | undefined {
  let best: { value: string | unknown[]; set: (next: never) => void } | undefined;
  const consider = (value: string | unknown[], set: (next: never) => void) => {
    if (!best || value.length > best.value.length) best = { value, set };
  };
  const visit = (value: unknown, set: (next: never) => void) => {
    if (typeof value === "string") {
      if (kind === "string") consider(value, set);
    } else if (Array.isArray(value)) {
      if (kind === "array") consider(value, set);
      value.forEach((item, i) => visit(item, (next) => (value[i] = next)));
    } else if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) visit(record[key], (next) => (record[key] = next));
    }
  };
  visit(root, () => {});
  return best as Found<string> | Found<unknown[]> | undefined;
}

export interface EnrichmentToolSpec<S extends z.ZodObject> {
  readonly id: string;
  // What the model reads when it chooses a tool.
  readonly description: string;
  readonly inputSchema: S;
  readonly kind: BudgetKind;
  execute(input: z.infer<S>, budget: RunBudget): Promise<unknown>;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

// A Mastra tool for research: it throws if the run is aborted, charges the
// budget (returning `{ ok: false, error }` when that kind is spent), turns
// thrown non-abort errors such as HTTP failures, refusals and timeouts into
// `{ ok: false, error }` the model can read, and fits the result to
// `limits.toolResultBytes`. Abort errors always propagate, so a cancelled run
// stops rather than carrying on with an error result. The stored message gets
// `toolTranscript()`'s summary.
export function enrichmentTool<S extends z.ZodObject>(
  budget: RunBudget,
  spec: EnrichmentToolSpec<S>,
): ReturnType<typeof createTool> {
  return createTool({
    id: spec.id,
    description: spec.description,
    inputSchema: spec.inputSchema,
    transform: toolTranscript(),
    execute: async (input) => {
      budget.signal.throwIfAborted();
      const refused = budget.take(spec.kind);
      if (refused) return { ok: false, error: refused };
      let result: unknown;
      try {
        // Mastra has validated `input` against `inputSchema`.
        result = await spec.execute(input as z.infer<S>, budget);
      } catch (error) {
        if (budget.signal.aborted || isAbortError(error)) throw error;
        return fitToBytes({ ok: false, error: error instanceof Error ? error.message : String(error) }, budget.limits.toolResultBytes);
      }
      budget.signal.throwIfAborted();
      return fitToBytes(result, budget.limits.toolResultBytes);
    },
  });
}

export type EnrichmentTool = ReturnType<typeof enrichmentTool>;

// What `toolTranscript()` keeps of each tool call in the stored message.
export const TRANSCRIPT_LIMITS: {
  // Every string in the stored args, so tool labels still read well.
  readonly argChars: number;
  // The stored result summary, as JSON.
  readonly outputBytes: number;
  // The stored error message.
  readonly errorChars: number;
} = {
  argChars: 120,
  outputBytes: 160,
  errorChars: 300,
};

// The longest string `summarizeToolOutput` keeps whole, and how many fields it
// keeps besides `ok`, `error` and a validation `message`.
const SUMMARY_TEXT_CHARS = 100;
const SUMMARY_EXTRA_FIELDS = 4;
// Kept ahead of other fields, because they say what was read or found.
const SUMMARY_FIRST_KEYS = ["url", "domain", "count"];

// Mastra's `transform` for an enrichment tool. It changes only what's
// stored in `mastra_messages` and synced to every window; the model still
// gets the full result. A run's tool calls all merge into one assistant row
// that's re-saved after each step, so storing whole results would push the row
// out of line, which breaks sync while the Neon Realtime TOAST workaround lasts
// (`keepSyncedValuesInline` in setup.ts). Mastra stores this copy twice
// (in the part and in its provider metadata), hence the tight limits.
//
// All three phases are set: when `transcript` has no function for a phase,
// Mastra stores `{ message: "Tool <phase> payload unavailable" }` instead,
// which would replace the args and turn `errorText` into an object.
// Each function returns a defined value for the same reason.
export function toolTranscript(): {
  readonly transcript: {
    readonly input: ToolPayloadTransformFunction;
    readonly output: ToolPayloadTransformFunction;
    readonly error: ToolPayloadTransformFunction;
  };
} {
  return {
    transcript: {
      input: ({ input }) => clipStrings(input ?? {}, TRANSCRIPT_LIMITS.argChars),
      output: ({ output }) => summarizeToolOutput(output),
      error: ({ error }) => truncate(errorMessage(error), TRANSCRIPT_LIMITS.errorChars),
    },
  };
}

// A short summary of a tool result for the stored message, at most
// TRANSCRIPT_LIMITS.outputBytes of JSON. It keeps what the activity view needs
// to tell success from failure: `ok`, a clipped `error` string, and
// `error: true` with its `message` for Mastra's input-validation failures. Then
// it adds a few short scalar fields, `url`, `domain` and `count` first, with
// arrays stored as their length (`results: 5`). Long text, nested objects and
// nulls are left out.
export function summarizeToolOutput(output: unknown): Record<string, unknown> {
  const max = TRANSCRIPT_LIMITS.outputBytes;
  if (Array.isArray(output)) return { count: output.length };
  if (typeof output === "string") return fitText({}, "value", output, max);
  if (typeof output === "boolean" || (typeof output === "number" && Number.isFinite(output))) return { value: output };
  if (!isPlainRecord(output)) return {};

  let summary: Record<string, unknown> = {};
  if (typeof output.ok === "boolean") summary.ok = output.ok;
  if (output.error === true) {
    summary.error = true;
    if (typeof output.message === "string") summary = fitText(summary, "message", output.message, max);
  } else if (typeof output.error === "string") {
    summary = fitText(summary, "error", output.error, max);
  }
  const keys = [
    ...SUMMARY_FIRST_KEYS.filter((key) => key in output),
    ...Object.keys(output).filter((key) => !SUMMARY_FIRST_KEYS.includes(key)),
  ];
  let extra = 0;
  for (const key of keys) {
    if (extra >= SUMMARY_EXTRA_FIELDS) break;
    if (key in summary || key === "error" || (key === "message" && output.error === true)) continue;
    const value = shortValue(output[key]);
    if (value === undefined) continue;
    const next = { ...summary, [key]: value };
    if (jsonBytes(next) > max) continue;
    summary = next;
    extra += 1;
  }
  return summary;
}

function shortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return value.length <= SUMMARY_TEXT_CHARS ? value : undefined;
  return undefined;
}

// Adds `text` under `key`, clipped so the summary stays within `maxBytes`
// (escaping and multi-byte characters included). Leaves it out if not even a
// short prefix fits.
function fitText(summary: Record<string, unknown>, key: string, text: string, maxBytes: number): Record<string, unknown> {
  let chars = Math.min(text.length, maxBytes);
  while (chars > 0) {
    const next = { ...summary, [key]: truncate(text, chars) };
    const over = jsonBytes(next) - maxBytes;
    if (over <= 0) return next;
    chars -= Math.max(1, Math.ceil(over / 3));
  }
  return summary;
}

// Every string in a JSON-compatible value cut to `maxChars`, for stored args.
function clipStrings(value: unknown, maxChars: number): unknown {
  if (typeof value === "string") return truncate(value, maxChars);
  if (Array.isArray(value)) return value.map((item) => clipStrings(item, maxChars));
  if (isPlainRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clipStrings(item, maxChars)]));
  }
  return value;
}

// Mastra passes the error it rebuilt from the tool's throw (an Error), but a
// string or a plain `{ message }` is handled too. Never empty, because the
// stored text replaces the part's `errorText`.
function errorMessage(error: unknown): string {
  let message = "";
  if (error instanceof Error) message = error.message;
  else if (typeof error === "string") message = error;
  else if (isPlainRecord(error) && typeof error.message === "string") message = error.message;
  else if (error !== undefined && error !== null) message = String(error);
  return message.trim() || "Tool execution failed";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}
