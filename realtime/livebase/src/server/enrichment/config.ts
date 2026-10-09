// Fixed settings for enrichment's research tools: the optional API keys, the
// limits on every public-web fetch, and the hosts and paths no tool may read.
// Run budgets (steps, calls, cost) live in `budget.ts`.

export interface EnrichmentKeys {
  readonly exaApiKey: string | null;
  readonly xBearerToken: string | null;
  readonly gravatarApiKey: string | null;
}

// `||` rather than `??`, as in models.ts, so that an empty line in `.env`
// means "not set". A missing key unregisters the tool that needs it.
function key(value: string | undefined): string | null {
  return value?.trim() || null;
}

export function enrichmentKeys(env: NodeJS.ProcessEnv = process.env): EnrichmentKeys {
  return {
    exaApiKey: key(env.EXA_API_KEY),
    xBearerToken: key(env.X_BEARER_TOKEN),
    gravatarApiKey: key(env.GRAVATAR_API_KEY),
  };
}

// Limits for every request a tool makes to an arbitrary URL (see safe-fetch.ts).
export const FETCH_LIMITS: {
  readonly timeoutMs: number;
  readonly maxBytes: number;
  readonly maxRedirects: number;
  readonly userAgent: string;
} = {
  timeoutMs: 10_000,
  maxBytes: 1_500_000,
  maxRedirects: 5,
  userAgent: "LivebaseEnrichment/0.1 (+https://github.com/neondatabase)",
};

// Hosts whose content enrichment never fetches and never cites.
// `webSearch` also excludes them from Exa results. A host matches its
// subdomains too (`hostMatches`), and `isOffLimits` also refuses any URL that
// names one in its path or query, such as an archive or reader-proxy copy.
export const OFF_LIMITS_HOSTS: readonly string[] = [
  "linkedin.com",
  "lnkd.in",
  // LinkedIn's media CDN: profile photos are LinkedIn content too.
  "licdn.com",
  // Google News RSS is licensed for personal use only.
  "news.google.com",
  // People-data aggregators built largely on scraped profiles.
  "zoominfo.com",
  "rocketreach.co",
  "contactout.com",
  "signalhire.com",
  "lusha.com",
  "apollo.io",
  // Org-chart and executive-data sites whose terms forbid automated access:
  // theorg.com/terms §2 and equilar.com/terms-and-conditions §2.3.
  "theorg.com",
  "equilar.com",
];

// Sections of otherwise fine hosts that enrichment never fetches and never
// cites, as host plus path prefix. The host matches its subdomains and the
// prefix matches whole path segments, so "exa.ai/library" covers
// www.exa.ai/library/person/… but not exa.ai/blog or exa.ai/librarycard.
// `isOffLimits` checks these with OFF_LIMITS_HOSTS, and `webSearch` sends both
// in Exa's `excludeDomains`.
export const OFF_LIMITS_PATHS: readonly string[] = [
  // Exa's people library reproduces LinkedIn profiles, down to connection
  // counts and work history (found in the first live person search).
  "exa.ai/library",
];
