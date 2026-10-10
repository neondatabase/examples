// Every model string uses Mastra's `neon/` provider, which routes the call
// through the Neon AI Gateway using NEON_AI_GATEWAY_BASE_URL and
// NEON_AI_GATEWAY_TOKEN. `||` rather than `??` so that an empty line in
// `.env` falls back to the default.

// Extraction runs on every submission and should land in about two seconds,
// so it uses a small, fast model.
export const EXTRACTION_MODEL: string = process.env.LIVEBASE_EXTRACTION_MODEL || "neon/claude-haiku-4-5";

// Enrichment runs in the background and reasons over tool results, so it can
// afford a stronger, slower model. The gateway serves `claude-sonnet-5`
// (checked 2026-10-04).
export const ENRICHMENT_MODEL: string = process.env.LIVEBASE_ENRICHMENT_MODEL || "neon/claude-sonnet-5";

// A model's price in USD per million tokens.
export interface ModelPrice {
  readonly inputPerMTok: number;
  readonly outputPerMTok: number;
  readonly cacheReadPerMTok: number;
  readonly cacheWritePerMTok: number;
}

// The variables that override each price field.
const PRICE_VARIABLES: Readonly<Record<keyof ModelPrice, string>> = {
  inputPerMTok: "LIVEBASE_ENRICHMENT_PRICE_INPUT",
  outputPerMTok: "LIVEBASE_ENRICHMENT_PRICE_OUTPUT",
  cacheReadPerMTok: "LIVEBASE_ENRICHMENT_PRICE_CACHE_READ",
  cacheWritePerMTok: "LIVEBASE_ENRICHMENT_PRICE_CACHE_WRITE",
};

// The enrichment model's price, for the run's cost cap. The gateway's
// /v1/models lists `pricing: null`, so these are models.dev's `neon` provider
// prices for claude-sonnet-5 (2026-10-04). Set the LIVEBASE_ENRICHMENT_PRICE_*
// variables alongside LIVEBASE_ENRICHMENT_MODEL when switching models.
export const ENRICHMENT_MODEL_PRICE: ModelPrice = modelPrice(process.env, {
  inputPerMTok: 2,
  outputPerMTok: 10,
  cacheReadPerMTok: 0.2,
  cacheWritePerMTok: 2.5,
});

// `defaults`, with each field overridden by its variable when that holds a
// non-negative number. Anything else falls back, so a typo can't zero the cap.
export function modelPrice(env: NodeJS.ProcessEnv, defaults: ModelPrice): ModelPrice {
  const price = { ...defaults };
  for (const key of Object.keys(PRICE_VARIABLES) as (keyof ModelPrice)[]) {
    const raw = env[PRICE_VARIABLES[key]]?.trim();
    const value = raw ? Number(raw) : Number.NaN;
    if (Number.isFinite(value) && value >= 0) price[key] = value;
  }
  return price;
}

// The parts of a Mastra step's `usage` that cost money. `raw` is the
// provider's usage, whose own `raw` is the gateway's JSON.
export interface ModelUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
  readonly cachedInputTokens?: number;
  readonly raw?: unknown;
}

// One model call's cost in USD.
//
// - Output: `outputTokens` is the gateway's `completion_tokens`, which counts
//   reasoning tokens too. Sonnet 5 reasons by default through the gateway,
//   so if a provider ever reports reasoning separately (reasoning larger than
//   output), it's added, so reasoning is always billed as output.
// - Cache: the gateway reports Anthropic-style top-level
//   `cache_read_input_tokens` and `cache_creation_input_tokens`, which are
//   outside `prompt_tokens`, and Mastra's `cachedInputTokens` ignores them.
//   They're read from the raw usage. `cachedInputTokens`, when a provider
//   fills it, is OpenAI-style: part of the input, billed at the cache-read rate.
//   The app sends no cache_control, so expect zeros.
export function modelCostUsd(usage: ModelUsage | undefined, price: ModelPrice = ENRICHMENT_MODEL_PRICE): number {
  if (!usage) return 0;
  const input = count(usage.inputTokens);
  const cachedInput = Math.min(input, count(usage.cachedInputTokens));
  let output = count(usage.outputTokens);
  const reasoning = count(usage.reasoningTokens);
  if (reasoning > output) output += reasoning;
  const gateway = gatewayUsage(usage.raw);
  const cacheRead = count(gateway?.cache_read_input_tokens);
  const cacheWrite = count(gateway?.cache_creation_input_tokens);
  const usd =
    (input - cachedInput) * price.inputPerMTok +
    (cachedInput + cacheRead) * price.cacheReadPerMTok +
    cacheWrite * price.cacheWritePerMTok +
    output * price.outputPerMTok;
  return usd / 1_000_000;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

// The gateway's own usage object: `usage.raw.raw` for the AI SDK's v3 usage
// shape, or `usage.raw` when a provider passes it through directly.
function gatewayUsage(raw: unknown): Record<string, unknown> | null {
  const outer = asRecord(raw);
  const inner = asRecord(outer?.raw);
  return inner ?? outer;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}
