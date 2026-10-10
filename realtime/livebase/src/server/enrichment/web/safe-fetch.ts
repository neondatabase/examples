// Fetches arbitrary public URLs for enrichment's tools: any URL that came from
// the model, a page or a search result goes through `safeFetch`. Only http(s)
// on standard ports; every address a hostname resolves to is checked at connect
// time, so a redirect or a DNS answer can't reach a private network; redirects
// are followed by hand and re-checked, and with `robots: true` each hop is
// checked against its origin's robots.txt; one deadline covers the whole fetch,
// and response size is capped. Off-limits hosts and paths, URLs that proxy
// them, and search-engine results pages are refused before any request is made.

import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import type { Readable } from "node:stream";
import zlib from "node:zlib";

import { FETCH_LIMITS, OFF_LIMITS_HOSTS, OFF_LIMITS_PATHS } from "~/server/enrichment/config";

export interface SafeResponse {
  // The final URL, after redirects.
  readonly url: string;
  readonly status: number;
  readonly contentType: string;
  readonly body: Buffer;
  // True when the body was cut at `maxBytes`.
  readonly truncated: boolean;
}

// A request the toolkit won't make. Its message is written for the model.
export class FetchRefused extends Error {
  override name = "FetchRefused";
}

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  // The deprecated 6to4 relay anycast range.
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
// Ranges that embed or translate an IPv4 address are blocked whole, because
// on a NAT64 or 6to4 network they can route to a private IPv4 address.
for (const [network, prefix] of [
  // Unspecified, loopback and the deprecated IPv4-compatible `::a.b.c.d`.
  ["::", 96],
  // SIIT's IPv4-translated `::ffff:0:a.b.c.d`. (BlockList applies the IPv4
  // rules to IPv4-mapped `::ffff:a.b.c.d` itself.)
  ["::ffff:0:0:0", 96],
  // NAT64: the well-known prefix and the local-use one.
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:db8::", 32],
  // 6to4.
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  // Deprecated site-local.
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

// True for loopback, private, link-local, CGNAT, documentation, multicast and
// reserved addresses, and for anything that isn't an IP address at all.
// BlockList also applies the IPv4 rules to IPv4-mapped IPv6 addresses.
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return blocked.check(mapped[1]!, "ipv4");
    return blocked.check(address, "ipv6");
  }
  return true;
}

// True when `host` is `domain` or one of its subdomains.
export function hostMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === domain || h.endsWith(`.${domain}`);
}

// True for an off-limits host or path, and for a URL that leads to one through
// an archive, a cache, a translator or a reader proxy. Every fetch, image check
// and search result goes through this, so LinkedIn and LinkedIn-derived pages
// are never read or cited.
export function isOffLimits(url: string): boolean {
  return offLimitsRule(url) !== null;
}

interface OffLimitsRule {
  // The OFF_LIMITS_HOSTS or OFF_LIMITS_PATHS entry.
  readonly entry: string;
  // True when the URL names the entry rather than being on it.
  readonly embedded: boolean;
}

// The rule `raw` falls under, or null. Paths are compared lower-cased and
// percent-decoded, with repeated slashes collapsed, so `/Library`,
// `/%6Cibrary` and `//library` can't slip by.
function offLimitsRule(raw: string): OffLimitsRule | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const path = comparablePath(url.pathname);
  const direct = directRule(host, path);
  if (direct) return { entry: direct, embedded: false };
  // Google Translate proxies www.linkedin.com as www-linkedin-com.translate.goog:
  // dots become dashes, and dashes are doubled.
  if (host.endsWith(".translate.goog")) {
    const proxied = host.split(".")[0]!.replace(/--/g, "\0").replace(/-/g, ".").replace(/\0/g, "-");
    const rule = directRule(proxied, path);
    if (rule) return { entry: rule, embedded: true };
  }
  // web.archive.org/web/2024/https://www.linkedin.com/in/…, r.jina.ai/https://…,
  // translate.google.com/translate?u=…, webcache…/search?q=cache:linkedin.com/…:
  // the proxy would fetch the page for us. A page that merely mentions an
  // off-limits host in its URL is refused too, which costs nothing. Campaign
  // tags (`utm_source=linkedin.com`) are never fetched, so they don't count.
  const query = [...url.searchParams]
    .filter(([key]) => !/^utm_/i.test(key))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const named = decodeRepeatedly(`${path}?${query}`).toLowerCase();
  const embedded = EMBEDDED_RULES.find(({ pattern }) => pattern.test(named));
  return embedded ? { entry: embedded.entry, embedded: true } : null;
}

// Each entry as a whole host name inside other text, with its path prefix for
// OFF_LIMITS_PATHS: "linkedin.com" matches in "/https:/www.linkedin.com/in/x"
// and "cache:linkedin.com", but not in "notlinkedin.com" or "linkedin.community".
const EMBEDDED_RULES: readonly { readonly entry: string; readonly pattern: RegExp }[] = [
  ...OFF_LIMITS_HOSTS.map((entry) => ({ entry, pattern: new RegExp(`${hostToken(entry)}(?![a-z0-9-])`) })),
  ...OFF_LIMITS_PATHS.map((entry) => {
    const slash = entry.indexOf("/");
    const host = hostToken(entry.slice(0, slash));
    const prefix = escapeRegExp(entry.slice(slash + 1));
    return { entry, pattern: new RegExp(`${host}(?::\\d+)?/+${prefix}(?=$|[/?#&])`) };
  }),
];

function hostToken(domain: string): string {
  return `(?:^|[^a-z0-9-])${escapeRegExp(domain.toLowerCase())}`;
}

// The OFF_LIMITS_HOSTS or OFF_LIMITS_PATHS entry for a host and a comparable path.
function directRule(host: string, path: string): string | null {
  const domain = OFF_LIMITS_HOSTS.find((entry) => hostMatches(host, entry));
  if (domain) return domain;
  return (
    OFF_LIMITS_PATHS.find((entry) => {
      const slash = entry.indexOf("/");
      const prefix = entry.slice(slash);
      return hostMatches(host, entry.slice(0, slash)) && (path === prefix || path.startsWith(`${prefix}/`));
    }) ?? null
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Undoes double and triple percent-encoding (`%252F`), as a proxy would.
function decodeRepeatedly(value: string): string {
  let decoded = value;
  for (let round = 0; round < 3; round++) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      break;
    }
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function comparablePath(pathname: string): string {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // A malformed escape: compare the raw path.
  }
  return path.toLowerCase().replace(/\/{2,}/g, "/");
}

// `google.com`, `google.co.uk`, `google.com.au`; the same shape for Yandex.
const GOOGLE_HOST = /(?:^|\.)google\.(?:com?\.)?[a-z]{2,3}$/;
const YANDEX_HOST = /(?:^|\.)yandex\.(?:com?\.)?[a-z]{2,3}$/;
// Bing's news, image, video and shopping results.
const BING_VERTICAL_SEARCH = /^\/(?:news|images|videos|shop)\/search(?:\/|$)/;

function pathIs(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

// Search-engine results pages. Left to itself, the agent tries to read Google
// and Bing results, and only robots.txt stops it, so the app refuses them
// outright and points the model at `webSearch`.
export function isSearchResultsPage(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  // Decoded, with repeated slashes collapsed, so `/%73earch` and `//search`
  // are caught.
  const path = comparablePath(url.pathname);
  if (GOOGLE_HOST.test(host)) return pathIs(path, "/search");
  if (YANDEX_HOST.test(host)) return pathIs(path, "/search");
  if (hostMatches(host, "bing.com")) return pathIs(path, "/search") || BING_VERTICAL_SEARCH.test(path);
  if (hostMatches(host, "duckduckgo.com")) {
    return url.searchParams.has("q") || pathIs(path, "/html") || pathIs(path, "/lite");
  }
  if (hostMatches(host, "baidu.com")) return pathIs(path, "/s");
  if (hostMatches(host, "ecosia.org")) return pathIs(path, "/search");
  return (
    hostMatches(host, "search.yahoo.com") ||
    hostMatches(host, "search.brave.com") ||
    hostMatches(host, "startpage.com")
  );
}

// Resolves the hostname and refuses the connection if any address is private.
// It runs at connect time, so it also covers redirects and DNS rebinding
// between `checkUrl` and the request.
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
      return callback(new FetchRefused(`${hostname} resolves to a non-public address`), "", 0);
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
};

// Parses and vets a URL before any request. Throws `FetchRefused` with a
// message for the model.
export function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchRefused(`Not a valid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchRefused(`Only http and https URLs are allowed: ${raw}`);
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new FetchRefused(`Only standard ports are allowed: ${raw}`);
  }
  if (url.username || url.password) throw new FetchRefused("URLs with credentials are not allowed");
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal) && isPrivateAddress(literal)) throw new FetchRefused(`Private address: ${raw}`);
  const offLimits = offLimitsRule(url.href);
  if (offLimits?.embedded) {
    throw new FetchRefused(
      `This URL leads to ${offLimits.entry} content, which is off-limits. ` +
        "Archives, caches, translators and reader proxies of off-limits pages are refused too.",
    );
  }
  if (offLimits) {
    throw new FetchRefused(
      offLimits.entry.includes("/")
        ? `${offLimits.entry} pages are off-limits`
        : `${url.hostname} is off-limits`,
    );
  }
  if (isSearchResultsPage(url.href)) {
    throw new FetchRefused(
      `${url.hostname} search results pages can't be read. Use the webSearch tool to search the web instead.`,
    );
  }
  return url;
}

export interface SafeFetchOptions {
  readonly method?: "GET" | "HEAD";
  readonly accept?: string;
  readonly maxBytes?: number;
  // For the whole fetch, redirects included, so a chain of slow hops can't
  // hold a tool for several times the limit.
  readonly timeoutMs?: number;
  // The run's signal. An abort rejects with `signal.reason`.
  readonly signal?: AbortSignal;
  // Checks robots.txt before every request, redirects included, so a
  // shortener or a moved page can't lead to a disallowed page on another
  // origin. Refusals throw `FetchRefused`.
  readonly robots?: boolean;
}

export async function safeFetch(raw: string, options: SafeFetchOptions = {}): Promise<SafeResponse> {
  const timeoutMs = options.timeoutMs ?? FETCH_LIMITS.timeoutMs;
  const deadline = Date.now() + timeoutMs;
  let url = checkUrl(raw);
  for (let hop = 0; hop <= FETCH_LIMITS.maxRedirects; hop++) {
    options.signal?.throwIfAborted();
    if (options.robots) {
      const refusal = await beforeDeadline(robotsRefusal(url.href, options.signal), deadline, timeoutMs);
      if (refusal) throw new FetchRefused(hop === 0 ? refusal : `${refusal} (redirected from ${raw})`);
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw timedOut(timeoutMs);
    const { location, ...response } = await requestOnce(url, options, remaining, timeoutMs);
    if (location && response.status >= 300 && response.status < 400) {
      url = checkUrl(new URL(location, url).href);
      continue;
    }
    return response;
  }
  throw new FetchRefused(`Too many redirects from ${raw}`);
}

function timedOut(timeoutMs: number): Error {
  return new Error(`Timed out after ${timeoutMs} ms`);
}

// Waits for `promise`, but rejects with a timeout once `deadline` passes.
function beforeDeadline<T>(promise: Promise<T>, deadline: number, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(timedOut(timeoutMs)), Math.max(0, deadline - Date.now()));
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

type Hop = SafeResponse & { readonly location?: string };

// One request, with `remainingMs` left of the fetch's `timeoutMs`.
function requestOnce(url: URL, options: SafeFetchOptions, remainingMs: number, timeoutMs: number): Promise<Hop> {
  const maxBytes = options.maxBytes ?? FETCH_LIMITS.maxBytes;
  const signal = options.signal;
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    // Settles exactly once, whichever of the response, an error, the deadline
    // or the run's signal comes first.
    let settled = false;
    const settle = (done: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      signal?.removeEventListener("abort", onAbort);
      done();
    };
    const fail = (error: unknown) =>
      settle(() => {
        request.destroy();
        reject(error);
      });
    const onAbort = () => fail(signal?.reason ?? new Error("Aborted"));

    const request = client.request(
      url,
      {
        method: options.method ?? "GET",
        lookup: safeLookup,
        headers: {
          "user-agent": FETCH_LIMITS.userAgent,
          accept: options.accept ?? "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "en",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const contentType = String(response.headers["content-type"] ?? "");
        const location = response.headers.location;
        if (location && status >= 300 && status < 400) {
          // Close the connection rather than drain the body: settling clears
          // the deadline and the abort listener, so a body that never ends
          // would otherwise stream on past both.
          response.destroy();
          settle(() =>
            resolve({ url: url.href, status, contentType, body: Buffer.alloc(0), truncated: false, location }),
          );
          return;
        }
        const stream = decode(response);
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        const finish = () =>
          settle(() => resolve({ url: url.href, status, contentType, body: Buffer.concat(chunks), truncated }));
        stream.on("data", (chunk: Buffer) => {
          if (truncated) return;
          size += chunk.length;
          if (size > maxBytes) {
            // Size is counted after decoding, so a compressed bomb is capped too.
            truncated = true;
            chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes)));
            finish();
            response.destroy();
            if (stream !== response) stream.destroy();
          } else {
            chunks.push(chunk);
          }
        });
        stream.on("end", finish);
        stream.on("error", (error) => (truncated ? finish() : fail(error)));
        // A decoder doesn't forward the response's own errors, such as a reset.
        if (stream !== response) response.on("error", (error) => (truncated ? finish() : fail(error)));
      },
    );
    // A socket timeout only covers idle time, so the whole request has a deadline.
    const deadline = setTimeout(() => fail(timedOut(timeoutMs)), remainingMs);
    request.on("error", fail);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    request.end();
  });
}

function decode(response: http.IncomingMessage): Readable {
  switch (response.headers["content-encoding"]) {
    case "gzip":
      return response.pipe(zlib.createGunzip());
    case "deflate":
      return response.pipe(zlib.createInflate());
    case "br":
      return response.pipe(zlib.createBrotliDecompress());
    default:
      return response;
  }
}

// robots.txt rules per origin, shared by every run. Entries expire so a
// long-running server picks up changes, and the map is bounded. A robots.txt
// that couldn't be read is retried sooner.
const ROBOTS_TTL_MS = 60 * 60 * 1000;
const ROBOTS_RETRY_MS = 5 * 60 * 1000;
const ROBOTS_CACHE_SIZE = 500;

interface RobotsVerdict {
  readonly rules: readonly RobotsRule[];
  // Why robots.txt couldn't be read, when it couldn't: then `rules` disallow everything.
  readonly unreadable: string | null;
}

const robotsCache = new Map<string, { expires: number; readonly verdict: Promise<RobotsVerdict> }>();

// RFC 9309 §2.3.1: a 2xx is parsed, and any other 4xx means there's no
// robots.txt, so everything is allowed. A 5xx, a 429 or an unreachable server
// means "disallow everything" until it can be read. A refused robots.txt
// request (a redirect to an off-limits host, too many redirects) is treated as
// missing: the page itself still goes through `checkUrl`.
async function fetchRobots(origin: string): Promise<RobotsVerdict> {
  try {
    const response = await safeFetch(`${origin}/robots.txt`, { accept: "text/plain", maxBytes: 200_000, timeoutMs: 5_000 });
    if (response.status >= 200 && response.status < 300) {
      return { rules: parseRobots(response.body.toString("utf8")), unreadable: null };
    }
    if (response.status >= 500 || response.status === 429) {
      return { rules: DISALLOW_ALL, unreadable: `HTTP ${response.status}` };
    }
    return { rules: [], unreadable: null };
  } catch (error) {
    if (error instanceof FetchRefused) return { rules: [], unreadable: null };
    return { rules: DISALLOW_ALL, unreadable: error instanceof Error ? error.message : String(error) };
  }
}

const DISALLOW_ALL: readonly RobotsRule[] = [{ allow: false, pattern: "/" }];

function robotsVerdict(origin: string): Promise<RobotsVerdict> {
  const now = Date.now();
  const cached = robotsCache.get(origin);
  if (cached && cached.expires >= now) return cached.verdict;
  const entry = { expires: now + ROBOTS_TTL_MS, verdict: fetchRobots(origin) };
  void entry.verdict.then(({ unreadable }) => {
    if (unreadable) entry.expires = Math.min(entry.expires, Date.now() + ROBOTS_RETRY_MS);
  });
  robotsCache.delete(origin);
  robotsCache.set(origin, entry);
  if (robotsCache.size > ROBOTS_CACHE_SIZE) robotsCache.delete(robotsCache.keys().next().value!);
  return entry.verdict;
}

// Why robots.txt rules out fetching `raw`, as a message for the model, or null
// when it allows it. Honours the groups for this crawler's product token, or
// else `User-agent: *`. The robots.txt request isn't tied to `signal`, because
// the cached result is shared by other runs; an abort only stops this
// caller's wait.
export async function robotsRefusal(raw: string, signal?: AbortSignal): Promise<string | null> {
  signal?.throwIfAborted();
  const url = new URL(raw);
  const { rules, unreadable } = await untilAborted(robotsVerdict(url.origin), signal);
  if (unreadable) {
    return `${url.origin}/robots.txt couldn't be read (${unreadable}), so ${url.hostname} can't be fetched for now (RFC 9309)`;
  }
  return robotsRulesAllow(rules, url.pathname + url.search) ? null : `robots.txt disallows ${raw}`;
}

export async function robotsAllows(raw: string, signal?: AbortSignal): Promise<boolean> {
  return (await robotsRefusal(raw, signal)) === null;
}

export interface RobotsRule {
  readonly allow: boolean;
  readonly pattern: string;
}

// The product token robots.txt groups name this crawler by: "livebaseenrichment".
const ROBOTS_AGENT = FETCH_LIMITS.userAgent.split("/")[0]!.trim().toLowerCase();

// The `Allow`/`Disallow` rules in the groups for `agent`, or, when no group
// names it, the groups for `User-agent: *` (RFC 9309 §2.2.1).
export function parseRobots(text: string, agent: string = ROBOTS_AGENT): RobotsRule[] {
  const own: RobotsRule[] = [];
  const anyone: RobotsRule[] = [];
  let named = false;
  let forAgent = false;
  let forAnyone = false;
  let inAgentBlock = false;
  for (const line of text.split(/\r?\n/)) {
    const [rawKey, ...rest] = line.replace(/#.*/, "").split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (!key) continue;
    if (key === "user-agent") {
      // Consecutive User-agent lines share one group.
      if (!inAgentBlock) forAgent = forAnyone = false;
      inAgentBlock = true;
      if (value === "*") forAnyone = true;
      if (value.split("/")[0]!.trim().toLowerCase() === agent.toLowerCase()) forAgent = named = true;
    } else {
      inAgentBlock = false;
      if ((key === "allow" || key === "disallow") && value !== "") {
        const rule = { allow: key === "allow", pattern: value };
        if (forAgent) own.push(rule);
        else if (forAnyone) anyone.push(rule);
      }
    }
  }
  return named ? own : anyone;
}

// Google's precedence: the longest matching pattern wins, and `Allow` wins a
// tie. Patterns may use `*` and a trailing `$`.
export function robotsRulesAllow(rules: readonly RobotsRule[], path: string): boolean {
  const target = robotsComparable(path);
  let best: { readonly allow: boolean; readonly pattern: string } | null = null;
  for (const rule of rules) {
    const pattern = robotsComparable(rule.pattern);
    if (!robotsPatternMatches(pattern, target)) continue;
    if (!best || pattern.length > best.pattern.length || (pattern.length === best.pattern.length && rule.allow)) {
      best = { allow: rule.allow, pattern };
    }
  }
  return best?.allow ?? true;
}

// RFC 9309 §2.2.2: percent-encoded unreserved characters are decoded before
// comparing, so `/%73earch` is `/search`; other escapes keep one case.
// Repeated slashes are collapsed, so `//private` is `/private`.
function robotsComparable(value: string): string {
  return value
    .replace(/%([0-9a-f]{2})/gi, (escape, hex: string) => {
      const char = String.fromCharCode(Number.parseInt(hex, 16));
      return /[A-Za-z0-9\-._~]/.test(char) ? char : escape.toUpperCase();
    })
    .replace(/\/{2,}/g, "/");
}

function robotsPatternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path);
}

// Waits for `promise`, but rejects with the signal's reason as soon as it aborts.
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
