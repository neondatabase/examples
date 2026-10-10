// Web search for enrichment: one Exa tool, `webSearch`, plus the LinkedIn
// slug parser that gives a name-plus-LinkedIn-URL input its only usable hint.
//
// The search is how the agent finds what the company's own site doesn't say:
// the employer of a person known only by name, funding, news, a person's own
// site or GitHub. LinkedIn is never read or cited, so it's excluded
// on Exa's side and again here, in case a result slips through. So are the
// LinkedIn-derived pages in OFF_LIMITS_PATHS, such as Exa's people library.
//
// Exa is a fixed API host, so it uses global `fetch` rather than `safeFetch`.
// Result URLs are only returned to the model; reading one goes through
// `readWebPage`, which does use `safeFetch`.
//
// Request shape, settled with live calls on 2026-10-04:
// - `excludeDomains` takes hosts and host/path prefixes ("exa.ai/library"),
//   and works alongside `category: "company"` and `includeDomains`, although
//   Exa's docs say the company category rejects it. If Exa starts enforcing
//   that, the company search is retried once without the list.
// - Exa's documented categories no longer include "github", so `github` is
//   sent as `includeDomains: ["github.com"]`.
// - Highlights are query-relevant excerpts and usually carry the person's role
//   and employer; `text` is the start of the page and is the fallback.
// - `costDollars.total` was $0.007 per search of up to 10 results, contents
//   included, so the fallback charge uses that.

import { z } from "zod";

import { truncate } from "~/lib/format";
import { enrichmentTool, type EnrichmentTool, type RunBudget } from "~/server/enrichment/budget";
import { FETCH_LIMITS, OFF_LIMITS_HOSTS, OFF_LIMITS_PATHS, type EnrichmentKeys } from "~/server/enrichment/config";
import { isOffLimits } from "~/server/enrichment/web/safe-fetch";

const EXA_SEARCH_URL = "https://api.exa.ai/search";

// The categories the model may ask for. Exa's "linkedin profile" and "people"
// categories are left out on purpose: both are built from LinkedIn profiles.
export const SEARCH_CATEGORIES = ["company", "news", "personal site", "github"] as const;
export type SearchCategory = (typeof SEARCH_CATEGORIES)[number];

// Exa's `excludeDomains` takes host/path prefixes as well as hosts, so the
// off-limits paths (Exa's own LinkedIn-derived people library) go with
// the off-limits hosts.
export const SEARCH_EXCLUDED_DOMAINS: readonly string[] = [...OFF_LIMITS_HOSTS, ...OFF_LIMITS_PATHS];

export const SEARCH_LIMITS = {
  defaultResults: 5,
  maxResults: 8,
  // Snippets shrink as the result count grows, so the whole result stays
  // within RUN_LIMITS.toolResultBytes.
  maxSnippetChars: 600,
  minSnippetChars: 120,
  titleChars: 140,
  authorChars: 80,
  // Bytes per result taken by everything but the snippet: title, URL, date,
  // author and JSON punctuation.
  resultOverheadBytes: 220,
  // Used only when a response has no `costDollars` (see the header).
  fallbackCostUsd: 0.007,
} as const;

const webSearchInput = z.object({
  query: z
    .string()
    .trim()
    .min(2)
    .max(300)
    .describe('What to look for, such as "Dane Knecht Cloudflare" or "Fathom Analytics funding".'),
  category: z
    .enum(SEARCH_CATEGORIES)
    .optional()
    .describe(
      '"company" for company homepages, "news" for press, funding and announcements, "personal site" for personal sites and blogs, "github" for GitHub profiles.',
    ),
  numResults: z
    .number()
    .int()
    .min(1)
    .max(SEARCH_LIMITS.maxResults)
    .optional()
    .describe(`How many results to return, 1 to ${SEARCH_LIMITS.maxResults}. Defaults to ${SEARCH_LIMITS.defaultResults}.`),
});

export type WebSearchInput = z.infer<typeof webSearchInput>;

const WEB_SEARCH_DESCRIPTION = [
  `Search the web with Exa. Returns up to ${SEARCH_LIMITS.maxResults} results (default ${SEARCH_LIMITS.defaultResults}), each with a title, URL, published date, author and a short snippet.`,
  "Use it for what the company's own site doesn't say: the employer of a person known only by name, funding, recent news, or a person's own site, GitHub or speaker bios.",
  "LinkedIn and people-data sites are excluded and never appear.",
  "Results are leads, not facts: different people share a name, so confirm on the page itself with readWebPage before recording, and cite that page.",
].join(" ");

export interface SearchResult {
  readonly title: string;
  readonly url: string;
  readonly publishedDate?: string;
  readonly author?: string;
  readonly snippet: string;
}

// The webSearch tool, or nothing without an Exa key: an unregistered tool is
// one the agent never tries.
export function searchTools(budget: RunBudget, keys: EnrichmentKeys): { readonly webSearch?: EnrichmentTool } {
  const apiKey = keys.exaApiKey;
  if (!apiKey) return {};
  return {
    webSearch: enrichmentTool(budget, {
      id: "webSearch",
      description: WEB_SEARCH_DESCRIPTION,
      inputSchema: webSearchInput,
      kind: "search",
      execute: (input, runBudget) => runWebSearch(apiKey, input, runBudget),
    }),
  };
}

// The part of the run budget a search needs. Narrower than RunBudget so tests
// can pass a fake.
export type SearchBudget = Pick<RunBudget, "signal" | "limits" | "addCost">;

// One Exa search, mapped to results the model can read. Throws on HTTP errors
// and timeouts; `enrichmentTool` turns those into `{ ok: false, error }`,
// and lets an aborted run's error through.
export async function runWebSearch(
  apiKey: string,
  input: WebSearchInput,
  budget: SearchBudget,
  fetchImpl: typeof fetch = fetch,
): Promise<{ readonly ok: true; readonly results: SearchResult[]; readonly excluded?: number }> {
  const maxBytes = budget.limits.toolResultBytes;
  const chars = snippetChars(resultCount(input.numResults), maxBytes);
  const body = exaRequestBody(input, chars);
  let response = await postExa(apiKey, body, budget.signal, fetchImpl);
  if (!response.ok && response.status === 400 && body.category === "company" && /exclude/i.test(response.text)) {
    // See the header: off-limits results are still dropped below.
    response = await postExa(apiKey, { ...body, excludeDomains: undefined }, budget.signal, fetchImpl);
  }
  if (!response.ok) throw new Error(`Exa search failed with HTTP ${response.status}: ${truncate(response.text, 200)}`);

  const data: unknown = JSON.parse(response.text);
  budget.addCost("exa", exaCostUsd(data));
  const { results, excluded } = searchResults(data, chars);
  const fitted = fitResults(results, maxBytes);
  return excluded > 0 ? { ok: true, results: fitted, excluded } : { ok: true, results: fitted };
}

export interface ExaSearchBody {
  readonly query: string;
  readonly type: "auto";
  readonly numResults: number;
  readonly category?: Exclude<SearchCategory, "github">;
  readonly includeDomains?: readonly string[];
  readonly excludeDomains?: readonly string[];
  readonly contents: {
    readonly highlights: { readonly maxCharacters: number };
    readonly text: { readonly maxCharacters: number };
  };
}

// The Exa /search request for one tool call. Pure, for tests.
export function exaRequestBody(input: WebSearchInput, snippetMaxChars: number): ExaSearchBody {
  const base = {
    query: input.query,
    type: "auto" as const,
    numResults: resultCount(input.numResults),
    excludeDomains: SEARCH_EXCLUDED_DOMAINS,
    contents: {
      highlights: { maxCharacters: snippetMaxChars },
      text: { maxCharacters: snippetMaxChars },
    },
  };
  if (input.category === "github") return { ...base, includeDomains: ["github.com"] };
  if (input.category) return { ...base, category: input.category };
  return base;
}

// Snippet length for `count` results, so the tool result fits in `maxBytes`.
export function snippetChars(count: number, maxBytes: number): number {
  const perResult = Math.floor((maxBytes - 200) / Math.max(1, count)) - SEARCH_LIMITS.resultOverheadBytes;
  return Math.min(SEARCH_LIMITS.maxSnippetChars, Math.max(SEARCH_LIMITS.minSnippetChars, perResult));
}

function resultCount(requested: number | undefined): number {
  const count = Math.trunc(requested ?? SEARCH_LIMITS.defaultResults);
  return Math.min(SEARCH_LIMITS.maxResults, Math.max(1, count));
}

// Maps an Exa response to tool results. Drops off-limits results (hosts and
// paths, such as LinkedIn-derived pages) that slipped past `excludeDomains`,
// non-http(s) URLs and repeats, and reports how many off-limits results were
// dropped. Pure, for tests.
export function searchResults(data: unknown, snippetMaxChars: number): { results: SearchResult[]; excluded: number } {
  const raw = isRecord(data) && Array.isArray(data.results) ? data.results : [];
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  let excluded = 0;
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const url = httpUrl(item.url);
    if (!url || seen.has(url.href)) continue;
    if (isOffLimits(url.href)) {
      excluded += 1;
      continue;
    }
    seen.add(url.href);
    const publishedDate = isoDate(item.publishedDate);
    const author = text(item.author);
    results.push({
      title: truncate(text(item.title) ?? url.hostname, SEARCH_LIMITS.titleChars),
      url: url.href,
      ...(publishedDate ? { publishedDate } : {}),
      ...(author ? { author: truncate(author, SEARCH_LIMITS.authorChars) } : {}),
      snippet: snippet(item, snippetMaxChars),
    });
  }
  return { results, excluded };
}

// Exa's reported cost for the call, or the fallback when it reports none.
export function exaCostUsd(data: unknown): number {
  const total = isRecord(data) && isRecord(data.costDollars) ? data.costDollars.total : undefined;
  return typeof total === "number" && Number.isFinite(total) && total >= 0 ? total : SEARCH_LIMITS.fallbackCostUsd;
}

// Shortens snippets evenly until `{ ok, results }` fits in `maxBytes`, then
// drops trailing results if it still doesn't. `enrichmentTool`'s `fitToBytes`
// is the backstop, but it cuts the longest string first, which could be one
// result's snippet down to nothing while the others stay whole.
export function fitResults(results: readonly SearchResult[], maxBytes: number): SearchResult[] {
  let fitted = [...results];
  for (let attempt = 0; attempt < 6; attempt++) {
    const size = resultBytes(fitted);
    if (size <= maxBytes || fitted.length === 0) return fitted;
    const cut = Math.ceil((size - maxBytes) / fitted.length) + 16;
    const shorter = fitted.map((result) => ({
      ...result,
      snippet: truncate(result.snippet, Math.max(SEARCH_LIMITS.minSnippetChars, result.snippet.length - cut)),
    }));
    if (shorter.every((result, i) => result.snippet === fitted[i]?.snippet)) break;
    fitted = shorter;
  }
  while (fitted.length > 1 && resultBytes(fitted) > maxBytes) fitted = fitted.slice(0, -1);
  return fitted;
}

function resultBytes(results: readonly SearchResult[]): number {
  return Buffer.byteLength(JSON.stringify({ ok: true, results }));
}

function snippet(item: Record<string, unknown>, maxChars: number): string {
  const highlights = Array.isArray(item.highlights)
    ? item.highlights.filter((value): value is string => typeof value === "string" && value.trim() !== "")
    : [];
  const source = highlights.length > 0 ? highlights.join(" … ") : typeof item.text === "string" ? item.text : "";
  return truncate(cleanText(source), maxChars);
}

// Exa returns page text as Markdown, with "..." lines between highlight
// fragments. Headings and line breaks cost bytes and tell the model nothing.
function cleanText(value: string): string {
  return value
    .replace(/\n\s*\.\.\.\s*(?:\n|$)/g, " … ")
    .replace(/(^|\s)#{1,6}\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function httpUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function isoDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.replace(/\s+/g, " ").trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface ExaResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly text: string;
}

async function postExa(
  apiKey: string,
  body: ExaSearchBody,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<ExaResponse> {
  try {
    const response = await fetchImpl(EXA_SEARCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": FETCH_LIMITS.userAgent, "x-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_LIMITS.timeoutMs)]),
    });
    return { ok: response.ok, status: response.status, text: await response.text() };
  } catch (error) {
    // The run's own abort propagates as is. A timeout is an expected
    // failure, so it gets a message the model can act on.
    if (!signal.aborted && error instanceof Error && error.name === "TimeoutError") {
      throw new Error(`Exa didn't answer within ${FETCH_LIMITS.timeoutMs / 1000} s. Try again or carry on without it.`);
    }
    throw error;
  }
}

// LinkedIn profile slugs. The profile is never fetched; the URL's slug is the
// only part of it the agent may use, as a hint at the name to search for.
//
//   https://www.linkedin.com/in/dane-knecht-0a1b2c/
//     → { slug: "dane-knecht-0a1b2c", nameHint: "Dane Knecht" }
//
// Handles /in/ and the old /pub/ URLs, locale subdomains (uk.linkedin.com),
// missing schemes, query strings, percent-encoded accents and trailing
// punctuation from a pasted sentence. Returns null for
// anything that isn't a profile URL, such as /company/ pages or lnkd.in links.
export function parseLinkedInSlug(url: string): { readonly slug: string; readonly nameHint: string | null } | null {
  const raw = url.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;

  const [kind, segment] = parsed.pathname.split("/").filter(Boolean);
  if ((kind !== "in" && kind !== "pub") || !segment) return null;
  // Trailing punctuation comes from URLs pasted mid-sentence ("…/in/jane-doe.").
  const slug = decodeSegment(segment).toLowerCase().replace(/[.,;:!?'")\]]+$/u, "");
  if (!/^[\p{L}\p{M}\p{N}_-]{2,100}$/u.test(slug)) return null;
  return { slug, nameHint: nameFromSlug(slug) };
}

// Credentials people append to their slug, as in "jane-doe-phd".
const SLUG_SUFFIXES: ReadonlySet<string> = new Set(["phd", "mba", "cpa", "cfa", "pmp", "cissp", "msc", "bsc"]);

// "dane-knecht-0a1b2c" → "Dane Knecht". Trailing tokens with digits are
// LinkedIn's de-duplicating IDs. A slug that isn't at least two letter-only
// tokens, such as "zenorocha", gives no hint, because it can't be split into
// a first and last name reliably.
function nameFromSlug(slug: string): string | null {
  const tokens = slug.split(/[-_]+/).filter(Boolean);
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1] ?? "";
    if (!/\p{N}/u.test(last) && !SLUG_SUFFIXES.has(last)) break;
    tokens.pop();
  }
  if (tokens.length < 2 || !tokens.every((token) => /^[\p{L}\p{M}]+$/u.test(token))) return null;
  return tokens.map(capitalize).join(" ");
}

function capitalize(token: string): string {
  const [first = "", ...rest] = token;
  return `${first.toLocaleUpperCase()}${rest.join("")}`;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment).normalize("NFC");
  } catch {
    return segment;
  }
}
