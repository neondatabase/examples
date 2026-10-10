import { Resolver } from "node:dns/promises";
import { z } from "zod";

import { truncate } from "~/lib/format";
import { isPersonalEmailDomain, normalizeDomain, normalizeUrl } from "~/lib/normalize";
import { enrichmentTool, type EnrichmentTool, type RunBudget } from "~/server/enrichment/budget";
import { FETCH_LIMITS } from "~/server/enrichment/config";
import {
  extractPage,
  imagesOfPerson,
  namesPerson,
  socialHosts,
  type IconCandidate,
  type ImageCandidate,
  type JsonLdEntity,
  type PageFacts,
} from "~/server/enrichment/web/page";
import {
  checkUrl,
  hostMatches,
  isOffLimits,
  isPrivateAddress,
  safeFetch,
} from "~/server/enrichment/web/safe-fetch";

// The keyless company tools: read a public page, look an entity up in
// Wikidata, check a domain's DNS, and find a company's website from its name.
//
// Every page read goes through `safeFetch`, which refuses off-limits hosts and
// search results pages, and checks robots.txt on every redirect hop. Wikidata
// is a fixed API host, so it uses global `fetch` with the run's signal and a
// timeout. Expected failures come back as `{ ok: false, error }` for the model
// to read, and aborts propagate: `enrichmentTool` handles both, so the helpers
// here only rethrow when the run's signal has fired.

// readWebPage

// Images returned without a `person` filter: enough for a logo or a team grid,
// small enough for the result cap.
const MAX_PAGE_IMAGES = 8;
// Text around a mention of the person, so a long team page still shows their
// title even when the excerpt ends before their entry.
const MAX_PERSON_MENTIONS = 2;
const MENTION_CONTEXT_CHARS = 160;
// Room kept for the text excerpt: lists lose entries rather than leave less.
const MIN_TEXT_BYTES = 1_200;
// Non-HTML text bodies (JSON, plain text) are cut before fitting.
const RAW_TEXT_CHARS = 3_000;
// Sites list a dozen apple-touch-icon sizes; the largest few are enough to
// pick a square logo.
const MAX_ICONS = 4;
// Colleague photos returned alongside the person's own: one per
// colleague `recordColleague` may record (MAX_COLLEAGUES). Their alt and card
// text are clipped, because the URL has to stay whole and the text excerpt
// still needs room under the result cap.
const MAX_OTHER_PEOPLE_IMAGES = 6;
const OTHER_ALT_CHARS = 60;
const OTHER_NEARBY_CHARS = 80;

export interface PageResult {
  readonly ok: true;
  readonly status: number;
  readonly url: string;
  readonly title?: string;
  readonly description?: string;
  readonly siteName?: string;
  readonly ogImage?: string;
  readonly jsonLd: readonly unknown[];
  readonly icons: readonly unknown[];
  readonly socialLinks: readonly string[];
  readonly keyLinks: readonly unknown[];
  readonly images: readonly unknown[];
  // Only when `person` is given.
  readonly otherPeopleImages?: readonly unknown[];
  readonly personMentions?: readonly string[];
  readonly text: string;
}

// The lists that lose entries, largest first, when a page doesn't fit.
const PAGE_LISTS = ["images", "otherPeopleImages", "keyLinks", "socialLinks", "icons", "jsonLd", "personMentions"] as const;

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? "");
}

// Drops null, undefined and empty values, so image candidates and JSON-LD
// entities don't spend the result cap on `"alt": null`.
function compact<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)),
  ) as Partial<T>;
}

function cutText(text: string, fits: (candidate: string) => boolean): string {
  if (fits(text)) return text;
  let length = text.length;
  while (length > 0) {
    length = Math.floor(length * 0.9);
    const candidate = `${text.slice(0, length).trimEnd()}…`;
    if (fits(candidate)) return candidate;
  }
  return "";
}

// Fits a page result to the tool result cap without the generic
// `fitToBytes` fallback, which would turn the result into one JSON string.
// While the lists leave less than MIN_TEXT_BYTES for the text, the largest
// loses entries from its end (every list is ordered best first). The text
// excerpt then fills whatever room is left.
export function fitPageResult(result: PageResult, maxBytes: number): PageResult {
  const lists: Record<string, unknown[]> = {};
  for (const key of PAGE_LISTS) {
    const list = result[key];
    if (list) lists[key] = [...list];
  }
  const shell = () => ({ ...result, ...lists, text: "" });
  while (jsonBytes(shell()) > maxBytes - MIN_TEXT_BYTES) {
    const largest = Object.entries(lists)
      .filter(([, list]) => list.length > 0)
      .sort(([, a], [, b]) => jsonBytes(b) - jsonBytes(a))[0];
    if (!largest) break;
    largest[1].pop();
  }
  const base = shell();
  const text = cutText(result.text, (candidate) => jsonBytes({ ...base, text: candidate }) <= maxBytes);
  return { ...base, text } as PageResult;
}

// Accent- and case-insensitive folding that keeps a map back to the original
// characters, so a mention's snippet keeps its accents and capitals.
function foldWithMap(text: string): { readonly folded: string; readonly origin: readonly number[] } {
  let folded = "";
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const part = foldChars(text[i]!);
    for (let j = 0; j < part.length; j++) origin.push(i);
    folded += part;
  }
  return { folded, origin };
}

// Snippets around the person's full name, or failing that their last name.
export function personMentions(text: string, person: string): string[] {
  const words = foldChars(person).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return [];
  const { folded, origin } = foldWithMap(text);
  // Whole words, with any punctuation or spacing between them: "O'Brien",
  // "Jane\nDoe". The words are letters and digits only, so need no escaping.
  // The end of the name is checked against the original text (`endsWord`).
  const phrase = (parts: readonly string[]) =>
    new RegExp(`(?<![\\p{L}\\p{N}])${parts.join("[^\\p{L}\\p{N}]+")}`, "gu");
  const last = words.at(-1)!;
  const needles = [phrase(words), ...(words.length > 1 && last.length >= 2 ? [phrase([last])] : [])];
  for (const needle of needles) {
    const snippets: string[] = [];
    let lastEnd = -1;
    for (const match of folded.matchAll(needle)) {
      if (!endsWord(text, origin, folded.length, match.index + match[0].length)) continue;
      const at = origin[match.index]!;
      const start = Math.max(0, at - MENTION_CONTEXT_CHARS / 2);
      if (start < lastEnd) continue;
      lastEnd = Math.min(text.length, at + MENTION_CONTEXT_CHARS * 1.5);
      snippets.push(text.slice(start, lastEnd).replace(/\s+/g, " ").trim());
      if (snippets.length >= MAX_PERSON_MENTIONS) break;
    }
    if (snippets.length > 0) return snippets;
  }
  return [];
}

// Whether a name match ending at folded index `end` ends a word. A change
// from lower to upper case counts, because sibling elements laid out by CSS
// run together in the page text: "Karri SaarinenCo-founder, CEO".
function endsWord(text: string, origin: readonly number[], foldedLength: number, end: number): boolean {
  if (end >= foldedLength) return true;
  const next = text[origin[end]!] ?? "";
  if (!/[\p{L}\p{N}]/u.test(next)) return true;
  return /\p{Ll}/u.test(text[origin[end - 1]!] ?? "") && /\p{Lu}/u.test(next);
}

// Lower-case particles that may sit between the capitalized words of a name:
// "Ludwig van Beethoven", "María de la Cruz".
const NAME_PARTICLES: ReadonlySet<string> = new Set([
  "van", "von", "der", "den", "de", "da", "di", "du", "del", "della", "la", "le", "bin", "ibn", "al", "el", "ter", "ten", "y",
]);
// Capitalized words that make a label a logo, an icon, a product shot or a
// job title rather than a name: "Acme Logo", "Cash App", "Chief Executive
// Officer". Common surnames (Page, Post, Brand, Head) are left out on purpose.
const NOT_NAME_WORDS: ReadonlySet<string> = new Set([
  "logo", "logos", "logotype", "wordmark", "icon", "icons", "favicon", "badge", "emblem", "screenshot", "illustration",
  "graphic", "banner", "thumbnail", "mockup", "diagram", "dashboard", "app", "apps", "product", "products", "feature",
  "features", "platform", "integration", "image", "photo", "picture", "video", "background", "team", "office",
  "offices", "headquarters", "hq", "conference", "event", "award", "customer", "customers", "partner", "partners",
  "inc", "ltd", "llc", "gmbh", "corp", "labs", "the", "our", "meet", "chief", "officer", "executive", "president",
  "director", "manager", "engineer", "founder", "cofounder", "co-founder",
]);
// "Karri", "O'Brien", "McDonald", "Jean-Luc", "Dr." or an initial, "F.".
const NAME_WORD = /^\p{Lu}(?:\p{Ll}|['’-]\p{Lu})[\p{L}'’-]*\.?$|^\p{Lu}\.$/u;
// Words around a name in alt text: "Photo of Jane Doe", "Jane Doe's headshot".
const NAME_WRAPPER_START = /^(?:an?\s+)?(?:profile\s+)?(?:photo|picture|portrait|headshot|image|avatar)\s+of\s+/iu;
const NAME_WRAPPER_END = /(?:['’]s)?\s+(?:profile\s+)?(?:photo|picture|portrait|headshot|image|avatar)$/iu;
// Where a label's name ends: "Jane Doe, CEO", "Jane Doe · Head of Sales",
// "Jane Doe – CTO", "Jane Doe (CTO)", "Jane Doe | Acme". A hyphen counts only
// with spaces around it, so "Jean-Luc" stays whole.
const NAME_END = /\s*(?:[,·|:;(]|\s-\s|[–—])\s*/u;
// Alt text that says only that it's a photo, or is a file name: the card text
// labels the image instead.
const GENERIC_ALT = /^(?:(?:an?\s+)?(?:profile\s+)?(?:photo|picture|pic|portrait|headshot|image|avatar|img)s?|[\w.-]+\.(?:jpe?g|png|webp|gif|avif))$/i;

// Pure: the name at the start of an image label, or null when the label isn't
// a name: 2–4 capitalized words, with lower-case particles allowed between
// them, none of them a logo, product or job-title word. Group photos
// ("Jane Doe and John Roe", "From left: …") don't pass, because "and" and
// "left" aren't name words.
export function leadingPersonName(label: string | null | undefined): string | null {
  if (!label) return null;
  const name = label.trim().replace(NAME_WRAPPER_START, "").split(NAME_END)[0]!.replace(NAME_WRAPPER_END, "").trim();
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2 || !NAME_WORD.test(words[0]!) || !NAME_WORD.test(words.at(-1)!)) return null;
  let capitalized = 0;
  for (const word of words) {
    if (NOT_NAME_WORDS.has(foldChars(word).replace(/\.$/, ""))) return null;
    if (NAME_WORD.test(word)) capitalized++;
    else if (!NAME_PARTICLES.has(word)) return null;
  }
  return capitalized >= 2 && capitalized <= 4 ? name : null;
}

// Logos and icons, whatever their alt says: the URL names them, or the image
// is SVG, or its declared shape is a banner or wordmark rather than a photo.
const LOGO_URL = /(?:^|[/_.-])(?:logos?|icons?|favicons?|wordmarks?|brand(?:ing)?|badges?|sprites?)(?:[/_.-]|$)|\.svg$/i;

function looksLikeLogo(image: ImageCandidate): boolean {
  let where: string;
  try {
    const url = new URL(image.url);
    where = `${url.hostname}${url.pathname}`;
  } catch {
    return true;
  }
  if (LOGO_URL.test(where)) return true;
  const { width, height } = image;
  return width !== null && height !== null && width > 0 && height > 0 && Math.max(width, height) / Math.min(width, height) > 2;
}

// The name an image is labelled with: a JSON-LD Person's name, or the name at
// the start of its alt text or, when the alt is missing or generic, its card
// text. An alt that describes something else ("Our office") wins over the
// card text, and og:image describes the page, not a person.
function labelledName(image: ImageCandidate): string | null {
  if (image.source === "og") return null;
  if (image.source === "jsonld") {
    // `extractPage` labels a JSON-LD image "<type>: <name>"; an
    // Organization's image is its logo.
    const entity = /^Person: (.+)$/.exec(image.nearbyText ?? "");
    return entity ? leadingPersonName(entity[1]) : null;
  }
  const alt = image.alt?.trim();
  if (alt && !GENERIC_ALT.test(alt)) return leadingPersonName(alt);
  return leadingPersonName(image.nearbyText);
}

export interface OtherPersonImage {
  readonly url: string;
  readonly alt?: string;
  readonly nearbyText?: string;
}

// Pure: photos labelled with someone other than `person`, in page order, at
// most 6, for `recordColleague`'s photoUrl. Before this, a team page
// read with `person` showed only the person's own photo, so every colleague
// was recorded without one. An image whose alt or card text names `person`,
// or that `own` (their images) holds, is never offered, so the person's
// avatar still comes only from `images`. One photo per name; alt and
// card text are clipped to save room under the result cap.
export function imagesOfOtherPeople(
  page: PageFacts,
  person: string,
  own: readonly ImageCandidate[] = imagesOfPerson(page, person),
): OtherPersonImage[] {
  const ownUrls = new Set(own.map((image) => image.url));
  const names = new Set<string>();
  const others: OtherPersonImage[] = [];
  for (const image of page.images) {
    if (others.length >= MAX_OTHER_PEOPLE_IMAGES) break;
    // An off-limits photo would only be refused by recordColleague.
    if (ownUrls.has(image.url) || !citable(image.url) || looksLikeLogo(image)) continue;
    if (namesPerson(image.alt, person) || namesPerson(image.nearbyText, person)) continue;
    const name = labelledName(image);
    const key = name ? foldChars(name).replace(/[^\p{L}\p{N}]+/gu, " ").trim() : "";
    if (!key || names.has(key)) continue;
    names.add(key);
    others.push(
      compact({
        url: image.url,
        alt: image.alt ? truncate(image.alt, OTHER_ALT_CHARS) : null,
        nearbyText: image.nearbyText ? truncate(image.nearbyText, OTHER_NEARBY_CHARS) : null,
      }) as OtherPersonImage,
    );
  }
  return others;
}

// The declared size of an icon, for ordering: SVG first, then the largest.
function iconSize(icon: IconCandidate): number {
  if (/svg/i.test(icon.type ?? "") || /\.svg(?:$|\?)/i.test(icon.url)) return 10_000;
  const sizes = (icon.sizes ?? "").match(/\d+/g)?.map(Number) ?? [];
  if (sizes.length > 0) return Math.max(...sizes);
  return /apple-touch-icon/.test(icon.rel) ? 180 : 16;
}

// Pure: the page's icons, deduplicated by URL, largest first.
export function bestIcons(icons: readonly IconCandidate[], max = MAX_ICONS): IconCandidate[] {
  const seen = new Set<string>();
  return [...icons]
    .sort((a, b) => iconSize(b) - iconSize(a))
    .filter((icon) => !seen.has(icon.url) && seen.add(icon.url))
    .slice(0, max);
}

// LinkedIn and the other off-limits hosts are never cited, so their links are
// left out of what the model sees.
function citable(url: string | undefined): boolean {
  return Boolean(url) && !isOffLimits(url!);
}

function citableEntity(entity: JsonLdEntity): Partial<JsonLdEntity> {
  return compact({ ...entity, sameAs: entity.sameAs?.filter(citable) });
}

function absoluteTarget(raw: string): string {
  const url = raw.trim();
  return /^https?:\/\//i.test(url) ? url : `https://${url.replace(/^\/\//, "")}`;
}

async function readWebPage(rawUrl: string, person: string | undefined, budget: RunBudget): Promise<unknown> {
  const target = absoluteTarget(rawUrl);
  // Refuse off-limits hosts and search results pages before robots.txt is
  // fetched, so not even that request goes to them.
  checkUrl(target);
  // robots.txt is checked for each hop, so a shortener or a moved page can't
  // lead to a page that another origin disallows. A refusal comes back to the
  // model as `{ ok: false, error }`.
  const response = await safeFetch(target, { signal: budget.signal, robots: true });
  const maxBytes = budget.limits.toolResultBytes;
  if (response.status >= 400) {
    return { ok: false, status: response.status, url: response.url, error: `HTTP ${response.status}` };
  }
  const body = response.body.toString("utf8");
  if (!/html|xml/i.test(response.contentType)) {
    if (!/^text\/|json/i.test(response.contentType)) {
      return { ok: false, url: response.url, error: `Not a readable page (${response.contentType || "unknown type"})` };
    }
    return { ok: true, status: response.status, url: response.url, contentType: response.contentType, text: body.slice(0, RAW_TEXT_CHARS) };
  }
  // The whole visible text, so a person's mention deep in a team page is found;
  // the excerpt sent to the model is cut to fit below.
  const page = extractPage(body, response.url, 200_000);
  const images: readonly ImageCandidate[] = person
    ? imagesOfPerson(page, person)
    : page.images.filter((image) => image.alt).slice(0, MAX_PAGE_IMAGES);
  // Colleagues' photos from the same read; without `person`, the
  // result is unchanged.
  const others = person ? imagesOfOtherPeople(page, person, images) : null;
  const mentions = person ? personMentions(page.text, person) : [];
  return fitPageResult(
    {
      ok: true,
      status: response.status,
      url: page.url,
      title: page.title,
      description: page.description,
      siteName: page.siteName,
      ogImage: page.ogImage,
      jsonLd: page.jsonLd.map(citableEntity),
      icons: bestIcons(page.icons).map((icon) => compact(icon)),
      socialLinks: page.socialLinks.filter(citable),
      keyLinks: page.keyLinks.filter((link) => citable(link.url)),
      images: images.map((image) => compact(image)),
      ...(others ? { otherPeopleImages: others } : {}),
      ...(mentions.length > 0 ? { personMentions: mentions } : {}),
      text: page.text,
    },
    maxBytes,
  );
}

// checkDomain

// A resolver per call, so a run's abort cancels only its own queries, and
// queries still pending when `run` settles are cancelled too.
async function withResolver<T>(signal: AbortSignal, run: (resolver: Resolver) => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  const resolver = new Resolver({ timeout: 3_000, tries: 2 });
  const cancel = () => resolver.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const result = await run(resolver);
    signal.throwIfAborted();
    return result;
  } finally {
    signal.removeEventListener("abort", cancel);
    resolver.cancel();
  }
}

function settled<T>(promise: Promise<T>): Promise<T | undefined> {
  return promise.catch(() => undefined);
}

// Only public addresses count as resolving: a name that points only at a
// private or internal address (host.docker.internal, *.svc.cluster.local)
// can't be fetched, and saying it exists would tell the model and the stored
// transcript about the internal network.
function hasPublicAddress(addresses: readonly string[] | undefined): boolean {
  return Boolean(addresses?.some((address) => !isPrivateAddress(address)));
}

// True as soon as either an A or an AAAA lookup answers with a public
// address: some name servers take seconds to time out an AAAA query for a
// domain that has an A record.
async function domainResolves(domain: string, signal: AbortSignal): Promise<boolean> {
  return withResolver(signal, async (resolver) => {
    const answered = (lookup: Promise<string[]>) =>
      lookup.then((addresses) => {
        if (!hasPublicAddress(addresses)) throw new Error("no public addresses");
      });
    return Promise.any([answered(resolver.resolve4(domain)), answered(resolver.resolve6(domain))]).then(
      () => true,
      () => false,
    );
  });
}

function mailProvider(hosts: readonly string[]): string | undefined {
  const joined = hosts.join(" ");
  if (/google\.com|googlemail\.com/.test(joined)) return "Google Workspace";
  if (/outlook\.com|protection\.outlook/.test(joined)) return "Microsoft 365";
  if (/pphosted\.com/.test(joined)) return "Proofpoint";
  if (/mimecast/.test(joined)) return "Mimecast";
  if (/zoho/.test(joined)) return "Zoho Mail";
  if (/protonmail/.test(joined)) return "Proton Mail";
  if (/messagingengine\.com/.test(joined)) return "Fastmail";
  return hosts.length > 0 ? "other" : undefined;
}

export async function checkDomain(raw: string, signal: AbortSignal): Promise<unknown> {
  // An email address is fine: the model often has one before the domain.
  const domain = normalizeDomain(raw.trim().replace(/^.*@/, ""));
  if (!domain) return { ok: false, error: `Not a domain: ${raw}` };
  // The app's list, so the tool agrees with extraction about which
  // domains say nothing about the company.
  const personal = isPersonalEmailDomain(domain);
  const [a, aaaa, mx] = await withResolver(signal, (resolver) =>
    Promise.all([
      settled(resolver.resolve4(domain)),
      settled(resolver.resolve6(domain)),
      settled(resolver.resolveMx(domain)),
    ]),
  );
  const mxHosts = [...(mx ?? [])].sort((x, y) => x.priority - y.priority).map((record) => record.exchange.toLowerCase());
  return {
    ok: true,
    domain,
    personalEmailProvider: personal,
    resolves: hasPublicAddress(a) || hasPublicAddress(aaaa),
    hasMx: mxHosts.length > 0,
    mxHosts: mxHosts.slice(0, 5),
    mailProvider: mailProvider(mxHosts),
  };
}

// wikidataLookup

export type WikidataType = "company" | "person";

const COMMON_PROPERTIES = {
  website: "P856",
  image: "P18",
  xUsername: "P2002",
  github: "P2037",
} as const;

const TYPE_PROPERTIES = {
  company: {
    inception: "P571",
    hq: "P159",
    country: "P17",
    industry: "P452",
    employees: "P1128",
    exchange: "P414",
    logo: "P154",
  },
  person: {
    employer: "P108",
    position: "P39",
  },
} as const;

// Properties whose values are items, so the query asks for their labels.
const ITEM_VALUED = new Set(["hq", "country", "industry", "exchange", "employer", "position"]);

// Pure: the SPARQL for the fields of `ids`. People must be humans (Q5) and
// companies mustn't be, so a same-named person doesn't pass as a company.
export function wikidataQuery(ids: readonly string[], type: WikidataType): string {
  const properties = { ...COMMON_PROPERTIES, ...TYPE_PROPERTIES[type] };
  const selected = Object.keys(properties).map((key) => (ITEM_VALUED.has(key) ? `?${key}Label` : `?${key}`));
  const optionals = Object.entries(properties).map(([key, property]) => `OPTIONAL { ?item wdt:${property} ?${key} }`);
  // Companies are also flagged when they're an organisation (Q43229) within a
  // few subclass hops: "exa" the command line tool isn't Exa the company. An
  // unbounded `wdt:P279*` path took 7–9 s here; four optional hops took 0.5 s.
  const filters =
    type === "person"
      ? ["?item wdt:P31 wd:Q5 ."]
      : [
          "FILTER NOT EXISTS { ?item wdt:P31 wd:Q5 }",
          "BIND(EXISTS { ?item wdt:P31/wdt:P279?/wdt:P279?/wdt:P279?/wdt:P279? wd:Q43229 } AS ?organization)",
        ];
  return [
    `SELECT ?item ?itemLabel ?itemDescription ${type === "company" ? "?organization " : ""}${selected.join(" ")} WHERE {`,
    `  VALUES ?item { ${ids.map((id) => `wd:${id}`).join(" ")} }`,
    ...filters.map((line) => `  ${line}`),
    ...optionals.map((line) => `  ${line}`),
    `  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }`,
    "} LIMIT 300",
  ].join("\n");
}

export interface WikidataMatch {
  readonly id: string;
  readonly url: string;
  readonly label?: string;
  readonly description?: string;
  readonly website?: readonly string[];
  readonly image?: string;
  readonly xUsername?: string;
  readonly github?: string;
  // Companies
  readonly organization?: boolean;
  readonly inception?: string;
  readonly headquarters?: readonly string[];
  readonly country?: readonly string[];
  readonly industry?: readonly string[];
  readonly employees?: readonly string[];
  readonly stockExchange?: readonly string[];
  readonly logo?: string;
  // People
  readonly employer?: readonly string[];
  readonly position?: readonly string[];
}

// Commons file URLs come back as http. P18 photos are often several
// megabytes, past the image check's 2 MB cap, so ask for a 400 px thumbnail.
export function commonsUrl(value: string | undefined, width?: number): string | undefined {
  if (!value) return undefined;
  const https = value.replace(/^http:\/\//, "https://");
  return width && /Special:FilePath\//.test(https) ? `${https}?width=${width}` : https;
}

type WikidataBinding = Record<string, { readonly value: string }>;

async function wikidataJson(url: string, signal: AbortSignal): Promise<any> {
  const response = await fetch(url, {
    headers: { "user-agent": FETCH_LIMITS.userAgent, accept: "application/json" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_LIMITS.timeoutMs)]),
  });
  if (!response.ok) throw new Error(`Wikidata returned HTTP ${response.status}`);
  return response.json();
}

// Label search (`wbsearchentities`) suits the model's lookups. `withWebsite`
// uses full-text search restricted to items with an official website instead:
// label search ranks "Resende" (a town) above Resend the company, which
// full-text search with `haswbstatement:P856` finds.
function wikidataSearchUrl(name: string, withWebsite: boolean): string {
  const params: Record<string, string> = withWebsite
    ? { action: "query", list: "search", srsearch: `${name} haswbstatement:P856`, srnamespace: "0", srlimit: "6", format: "json" }
    : { action: "wbsearchentities", search: name, language: "en", uselang: "en", type: "item", limit: "6", format: "json" };
  return `https://www.wikidata.org/w/api.php?${new URLSearchParams(params)}`;
}

export async function wikidataEntities(
  name: string,
  type: WikidataType,
  signal: AbortSignal,
  options: { readonly withWebsite?: boolean } = {},
): Promise<WikidataMatch[]> {
  const search = await wikidataJson(wikidataSearchUrl(name, options.withWebsite ?? false), signal);
  const hits: { id?: unknown; title?: unknown }[] = search.search ?? search.query?.search ?? [];
  const ids = hits
    .map((hit) => hit.id ?? hit.title)
    .filter((id): id is string => typeof id === "string" && /^Q\d+$/.test(id));
  if (ids.length === 0) return [];
  const result = await wikidataJson(
    `https://query.wikidata.org/sparql?${new URLSearchParams({ query: wikidataQuery(ids, type), format: "json" })}`,
    signal,
  );

  const byId = new Map<string, Map<string, Set<string>>>();
  for (const row of (result.results?.bindings ?? []) as WikidataBinding[]) {
    const id = row.item?.value.split("/").pop();
    if (!id) continue;
    const entry = byId.get(id) ?? new Map<string, Set<string>>();
    for (const [key, cell] of Object.entries(row)) {
      if (key === "item") continue;
      const values = entry.get(key) ?? new Set<string>();
      values.add(cell.value);
      entry.set(key, values);
    }
    byId.set(id, entry);
  }

  // Search order is Wikidata's relevance order; keep it.
  return ids.flatMap((id): WikidataMatch[] => {
    const entry = byId.get(id);
    if (!entry) return [];
    const list = (key: string, max = 5) => [...(entry.get(key) ?? [])].slice(0, max);
    const one = (key: string) => list(key, 1)[0];
    const common = {
      id,
      url: `https://www.wikidata.org/wiki/${id}`,
      // An item with no English label comes back labelled with its ID.
      label: one("itemLabel") === id ? undefined : one("itemLabel"),
      description: one("itemDescription"),
      // Shortest first, so the root comes before localized variants.
      website: list("website", 6).sort((a, b) => a.length - b.length).slice(0, 3),
      image: commonsUrl(one("image"), 400),
      xUsername: one("xUsername"),
      github: one("github"),
    };
    if (type === "person") {
      return [compact({ ...common, employer: list("employerLabel", 3), position: list("positionLabel", 3) }) as WikidataMatch];
    }
    return [
      compact({
        ...common,
        organization: one("organization") === "true",
        inception: one("inception")?.slice(0, 10),
        headquarters: list("hqLabel", 3),
        country: list("countryLabel", 2),
        industry: list("industryLabel", 4),
        employees: list("employees", 3),
        stockExchange: list("exchangeLabel", 2),
        logo: commonsUrl(one("logo")),
      }) as WikidataMatch,
    ];
  });
}

// findCompanyWebsite

export interface WebsiteMatch {
  readonly domain: string;
  readonly website: string;
  readonly source: "wikidata" | "candidate";
  readonly evidence: string;
}

// Homepages read per lookup. They're internal to the tool, so they aren't
// charged to the run's `read` budget, but each costs up to a fetch timeout.
const MAX_HOMEPAGE_CHECKS = 4;
const MAX_CANDIDATES = 8;
const HOMEPAGE_MAX_BYTES = 800_000;
// Per candidate, robots.txt included: parked domains are often slow to answer,
// and a better-ranked candidate's check holds up the result. A real homepage
// answered in under 2 s in testing; linear.com took over 8 s and isn't Linear.
const HOMEPAGE_DEADLINE_MS = 6_000;
// For both Wikidata requests together: the guessed candidates are a fallback.
const WIKIDATA_DEADLINE_MS = 5_000;
// Per candidate domain. Answers normally take well under 200 ms, but a
// filtering resolver took 9 s to answer for getexa.com.
const CANDIDATE_DNS_DEADLINE_MS = 2_000;
// Once a lower-ranked homepage matches, better-ranked checks still running get
// this long to finish before they're cancelled.
const MATCH_GRACE_MS = 1_500;
// The homepage check looks at the footer's copyright line too, so read it all.
const HOMEPAGE_TEXT_CHARS = 100_000;

// Legal forms, dropped from the end of a name: "Acme, Inc." is "acme".
const LEGAL_SUFFIXES: ReadonlySet<string> = new Set([
  "inc", "incorporated", "ltd", "limited", "llc", "llp", "lp", "plc", "corp", "corporation", "co",
  "gmbh", "ag", "sa", "sas", "sarl", "bv", "nv", "oy", "oyj", "ab", "as", "asa", "aps", "srl",
  "spa", "pty", "pte", "kk", "pbc", "ulc", "sl", "se",
]);

// Words a brand often leaves out of its domain: "Fathom Analytics" is at
// usefathom.com. They're dropped only to guess domains: the homepage must
// still name the company, so fathom.com's "Fathom" isn't "Fathom Analytics".
const DESCRIPTOR_WORDS: ReadonlySet<string> = new Set([
  "labs", "lab", "ai", "hq", "technologies", "technology", "tech", "software", "systems", "solutions",
  "group", "holdings", "studio", "studios", "app", "apps", "io", "digital", "analytics", "data",
  "cloud", "company", "global", "international", "ventures", "partners", "network", "networks", "platform",
]);

// Corporate words that a company's own site often leaves out of its name:
// modal.com calls itself "Modal", not "Modal Labs". Unlike DESCRIPTOR_WORDS,
// these may be dropped when matching a homepage or a Wikidata label, but only
// where a site names itself outright (see `homepageEvidence`).
const CORPORATE_WORDS: ReadonlySet<string> = new Set([
  "labs", "lab", "hq", "technologies", "technology", "tech", "software", "systems", "group", "holdings",
  "studio", "studios", "company", "ai",
]);

// A name ending in one of these often lives at that TLD: "Mistral AI" at mistral.ai.
const TLD_WORDS: ReadonlySet<string> = new Set(["ai", "io", "dev", "app", "co"]);

const LETTER_FOLDS: Readonly<Record<string, string>> = { ß: "ss", æ: "ae", ø: "o", œ: "oe", ł: "l", đ: "d", þ: "th" };

function foldChars(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[ßæøœłđþ]/g, (letter) => LETTER_FOLDS[letter] ?? letter);
}

// Accent-, case- and punctuation-insensitive form for comparing names.
function fold(value: string): string {
  return foldChars(value).replace(/['’`]/g, "").replace(/&/g, " and ");
}

function tokens(value: string): string[] {
  return fold(value).split(/[^a-z0-9]+/).filter(Boolean);
}

// The name's words without trailing legal forms (and a dangling "and" from
// "Acme & Co"), keeping at least one word. A leading "the" stays, because
// thebrowsercompany.com keeps it; `withoutTrailing` drops it where it matters.
export function companyNameTokens(name: string): string[] {
  const words = tokens(name);
  while (words.length > 1 && (LEGAL_SUFFIXES.has(words.at(-1)!) || words.at(-1) === "and")) words.pop();
  // A lone "and" or "the" (from "&" or "The") isn't a name.
  return words.length === 1 && (words[0] === "and" || words[0] === "the") ? [] : words;
}

function withoutTrailing(core: readonly string[], drop: ReadonlySet<string>): string[] {
  const words = core[0] === "the" && core.length > 1 ? core.slice(1) : [...core];
  while (words.length > 1 && drop.has(words.at(-1)!)) words.pop();
  return words;
}

function brandTokens(core: readonly string[]): string[] {
  return withoutTrailing(core, DESCRIPTOR_WORDS);
}

// The name as a site would write it in full ("modal labs"), and its short
// form without corporate words ("modal"), or null when there's none.
export function companyNameForms(name: string): { readonly full: string; readonly short: string | null } | null {
  const core = companyNameTokens(name);
  if (core.length === 0) return null;
  const full = withoutTrailing(core, new Set()).join(" ");
  const short = withoutTrailing(core, CORPORATE_WORDS).join(" ");
  return { full, short: short !== full ? short : null };
}

// Pure: likely domains for a company name, best first, at most 8. The name's
// own .com comes first, then the brand without descriptors, then the startup
// TLDs and the "use"/"get" prefixes (usefathom.com). Social networks and
// off-limits hosts are left out. Callers check each one.
export function domainCandidates(name: string): string[] {
  const candidates: string[] = [];
  // Social networks and off-limits hosts are never a company's own site, so
  // they cost no DNS query and no homepage check.
  const add = (domain: string | null | undefined) => {
    const normalized = ownSiteDomain(domain);
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  };

  // "Cal.com" or "monday.com" names its own domain.
  const trimmed = name.trim().toLowerCase();
  const named = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(trimmed) ? normalizeDomain(trimmed) : null;
  add(named);
  const core = companyNameTokens(named ? named.split(".")[0]! : name);
  if (core.length === 0) return candidates;

  const brand = brandTokens(core).join("");
  const joined = core.join("");
  const withoutAnd = core.filter((word) => word !== "and").join("");
  const hyphenated = core.join("-");
  const last = core.at(-1)!;

  if (core.length > 1 && TLD_WORDS.has(last)) add(`${brand}.${last}`);
  add(`${joined}.com`);
  add(`${withoutAnd}.com`);
  add(`${brand}.com`);
  add(`${brand}.io`);
  add(`${brand}.ai`);
  add(`use${brand}.com`);
  add(`get${brand}.com`);
  add(`${brand}.app`);
  add(`${brand}.dev`);
  add(`${brand}.co`);
  add(`try${brand}.com`);
  if (core.length > 1) add(`${hyphenated}.com`);
  return candidates.slice(0, MAX_CANDIDATES);
}

// Domain parking and for-sale pages repeat the domain's name but aren't the
// company: "ModalLabs.com is For Sale | BrandBucket".
const PARKED_PAGE =
  /\b(?:(?:is|may be) for sale|buy (?:this|the) domain|domain (?:name )?(?:is )?parked|parked (?:free|domain)|make an offer|hugedomains|sedo(?:parking)?|afternic|dan\.com|brandbucket|squadhelp|undeveloped)\b/i;

// Domain names on the page ("acme.io is for sale") are removed, so a page that
// only repeats its own domain doesn't name the company.
const DOMAIN_TOKEN = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/g;

function phraseIn(text: string | null | undefined, phrase: string, keepDomains: boolean): boolean {
  if (!text) return false;
  const folded = fold(text);
  const words = (keepDomains ? folded : folded.replace(DOMAIN_TOKEN, " ")).split(/[^a-z0-9]+/).filter(Boolean);
  return ` ${words.join(" ")} `.includes(` ${phrase} `);
}

// The copyright lines in a page's text: "© 2025 Modal Labs, Inc."
function copyrightLines(text: string): string[] {
  return [...text.matchAll(/(?:©|\(c\)|copyright)[^\n]{0,80}/gi)].map((match) => match[0]).slice(0, 5);
}

function quote(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > 80 ? `${flat.slice(0, 79)}…` : flat;
}

// Where the homepage names the company, for `WebsiteMatch.evidence`, or null.
// Only places where a site names itself count: the title, site name, JSON-LD
// organisation name and copyright line, and for the full name also the meta
// description. A page that merely mentions the company in its body (a review,
// a competitor, a wall of customer logos) doesn't. The short form ("Modal"
// for "Modal Labs") counts only where the site names itself outright.
export function homepageEvidence(page: PageFacts, name: string): string | null {
  const forms = companyNameForms(name);
  if (!forms) return null;
  const keepDomains = name.includes(".");
  const text = page.text ?? "";
  if (PARKED_PAGE.test(`${page.title ?? ""}\n${page.description ?? ""}\n${text.slice(0, 2_000)}`)) return null;

  const selfNamed: [string, string | null | undefined][] = [
    ["title", page.title],
    ["site name", page.siteName],
    ...page.jsonLd
      .filter((entity) => /Organization|Corporation|Business|Brand|WebSite/.test(entity.type))
      .map((entity): [string, string | null | undefined] => [`JSON-LD ${entity.type} name`, entity.name]),
    ...copyrightLines(text).map((line): [string, string] => ["copyright line", line]),
  ];
  const checks: [string, string | null | undefined, string][] = [
    ...selfNamed.map(([place, value]): [string, string | null | undefined, string] => [place, value, forms.full]),
    ["description", page.description, forms.full],
    ...(forms.short
      ? selfNamed.map(([place, value]): [string, string | null | undefined, string] => [place, value, forms.short!])
      : []),
  ];
  for (const [place, value, phrase] of checks) {
    if (phraseIn(value, phrase, keepDomains)) {
      const short = phrase === forms.full ? "" : ` (short for "${name.trim()}")`;
      const named = phrase === forms.full ? `"${name.trim()}"` : `"${phrase}"${short}`;
      return `homepage ${place} "${quote(value ?? "")}" names ${named}`;
    }
  }
  return null;
}

// Pure: whether the homepage names the company (see `homepageEvidence`).
export function homepageNamesCompany(page: PageFacts, name: string): boolean {
  return homepageEvidence(page, name) !== null;
}

// A domain that can be a company's own site: not a social network or an
// off-limits host. Mailbox providers are allowed here: Zoho and Yahoo do live
// at zoho.com and yahoo.com, they just aren't anyone's employer by email.
function ownSiteDomain(value: string | null | undefined): string | null {
  const domain = normalizeDomain(value);
  if (!domain) return null;
  if (socialHosts.some((host) => hostMatches(domain, host))) return null;
  if (isOffLimits(`https://${domain}/`)) return null;
  return domain;
}

// Words too common to tell two companies apart.
const CONTEXT_STOPWORDS: ReadonlySet<string> = new Set([
  "the", "and", "for", "with", "from", "that", "this", "their", "its", "our", "who", "are", "was", "has",
  "have", "not", "but", "all", "any", "can", "will", "into", "about", "more", "also", "other", "than",
  "company", "companies", "inc", "ltd", "llc", "corp", "based", "works", "working", "team", "head",
]);

// Pure: the distinctive words of `context` that aren't part of the name.
export function contextWords(context: string | undefined, name: string): string[] {
  if (!context) return [];
  const own = new Set(tokens(name));
  return [...new Set(tokens(context))].filter((word) => word.length >= 3 && !CONTEXT_STOPWORDS.has(word) && !own.has(word));
}

function wordHits(text: string, words: readonly string[]): string[] {
  if (words.length === 0) return [];
  const haystack = ` ${tokens(text).join(" ")} `;
  return words.filter((word) => haystack.includes(` ${word} `));
}

// Pure: the context words a homepage mentions anywhere (title, description,
// text), which is how a same-named company is told apart: "Neon" with
// "serverless Postgres" is neon.com, not the film company.
export function homepageContextHits(page: PageFacts, words: readonly string[]): string[] {
  return wordHits(`${page.title ?? ""}\n${page.siteName ?? ""}\n${page.description ?? ""}\n${page.text ?? ""}`, words);
}

// The site's root: a homepage that redirects to "/en" or "/pl-pl/" is still
// the company's website.
function siteRoot(url: string): string | null {
  const normalized = normalizeUrl(url);
  return normalized ? `${new URL(normalized).origin}/` : null;
}

interface WikidataSite {
  readonly match: WebsiteMatch;
  // Context words in the item's description, industry or location.
  readonly hits: readonly string[];
}

// Organisations whose label is the company's name, give or take corporate
// words ("Mistral AI" and "Mistral"), with an official website that resolves;
// those whose description agrees with the context first, then Wikidata's order.
async function wikidataSites(name: string, words: readonly string[], signal: AbortSignal): Promise<WikidataSite[]> {
  let matches: WikidataMatch[];
  try {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(WIKIDATA_DEADLINE_MS)]);
    matches = await wikidataEntities(name, "company", deadline, { withWebsite: true });
  } catch {
    // Wikidata down or slow: the guessed candidates still work.
    signal.throwIfAborted();
    return [];
  }
  const forms = companyNameForms(name);
  const key = forms?.short ?? forms?.full;
  const named = matches
    .filter((match) => {
      const label = match.label ? companyNameForms(match.label) : null;
      return match.organization && key && (label?.short ?? label?.full) === key;
    })
    .map((match, rank) => ({
      match,
      rank,
      hits: wordHits([match.description, ...(match.industry ?? []), ...(match.country ?? []), ...(match.headquarters ?? [])].join(" "), words),
    }))
    .sort((a, b) => b.hits.length - a.hits.length || a.rank - b.rank);
  const sites: WikidataSite[] = [];
  for (const { match, hits } of named) {
    for (const site of match.website ?? []) {
      const domain = ownSiteDomain(site);
      if (!domain || !(await domainResolves(domain, signal))) continue;
      const evidence = `Wikidata ${match.id} P856${match.description ? ` (${quote(match.description)})` : ""}`;
      sites.push({ match: { domain, website: siteRoot(site) ?? `https://${domain}/`, source: "wikidata", evidence }, hits });
      break;
    }
  }
  return sites;
}

interface HomepageCheck {
  readonly match: WebsiteMatch;
  readonly hits: readonly string[];
}

async function checkHomepage(
  domain: string,
  name: string,
  words: readonly string[],
  signal: AbortSignal,
  runSignal: AbortSignal,
): Promise<HomepageCheck | null> {
  try {
    // robots.txt is checked on every hop, including where a redirect lands.
    const response = await safeFetch(`https://${domain}/`, { signal, maxBytes: HOMEPAGE_MAX_BYTES, robots: true });
    if (response.status >= 400 || !/html/i.test(response.contentType)) return null;
    // A redirect moves the match to where the site really lives:
    // fathomanalytics.com redirects to usefathom.com.
    const finalDomain = ownSiteDomain(response.url);
    if (!finalDomain) return null;
    const page = extractPage(response.body.toString("utf8"), response.url, HOMEPAGE_TEXT_CHARS);
    const evidence = homepageEvidence(page, name);
    if (!evidence) return null;
    const website = siteRoot(response.url) ?? `https://${finalDomain}/`;
    return { match: { domain: finalDomain, website, source: "candidate", evidence }, hits: homepageContextHits(page, words) };
  } catch {
    // TLS errors, timeouts and refusals mean "not this candidate".
    runSignal.throwIfAborted();
    return null;
  }
}

function withContext(match: WebsiteMatch, hits: readonly string[], words: readonly string[]): WebsiteMatch {
  if (words.length === 0) return match;
  const note = hits.length > 0 ? `; mentions ${hits.join(", ")}` : `; doesn't mention ${words.join(", ")}`;
  return { ...match, evidence: `${match.evidence}${note}` };
}

// Wikidata's official website (P856) first, then guessed domains that resolve
// and whose homepage names the company. DNS for the candidates runs
// alongside the Wikidata lookup, so a miss there costs little time.
//
// Short names are ambiguous ("Neon", "Exa"), so `context` decides between
// same-named companies. A Wikidata match is taken at once when there's no
// context or its description agrees with it. Otherwise up to 4 homepages
// (Wikidata's first, then the candidates) are read in parallel, and the
// best-ranked one that names the company and mentions the context wins as
// soon as every better-ranked one has failed, or 1.5 s after it matched. With
// no such homepage, the best-ranked match is returned, with evidence saying
// the context didn't match.
export async function findCompanyWebsite(
  name: string,
  options: { readonly context?: string; readonly signal: AbortSignal },
): Promise<WebsiteMatch | null> {
  const { signal } = options;
  const words = contextWords(options.context, name);
  const candidates = domainCandidates(name);
  const resolving = Promise.all(
    candidates.map(async (domain) => {
      try {
        const deadline = AbortSignal.any([signal, AbortSignal.timeout(CANDIDATE_DNS_DEADLINE_MS)]);
        return (await domainResolves(domain, deadline)) ? domain : null;
      } catch {
        signal.throwIfAborted();
        return null;
      }
    }),
  );
  // A rejection here is rethrown below, or is moot once a match returns.
  resolving.catch(() => undefined);
  const wikidata = await wikidataSites(name, words, signal);
  const first = wikidata[0];
  if (first && (words.length === 0 || first.hits.length > 0)) return withContext(first.match, first.hits, words);

  const resolved = (await resolving).filter((domain): domain is string => domain !== null);
  const domains = [...new Set([...wikidata.map((site) => site.match.domain), ...resolved])].slice(0, MAX_HOMEPAGE_CHECKS);
  const done = new AbortController();
  const confirmed = (result: HomepageCheck) => words.length === 0 || result.hits.length > 0;
  let grace: ReturnType<typeof setTimeout> | undefined;
  try {
    const checks = domains.map(async (domain) => {
      const deadline = AbortSignal.any([signal, done.signal, AbortSignal.timeout(HOMEPAGE_DEADLINE_MS)]);
      const result = await checkHomepage(domain, name, words, deadline, signal);
      if (result && confirmed(result)) grace ??= setTimeout(() => done.abort(), MATCH_GRACE_MS);
      return result;
    });
    let fallback: HomepageCheck | null = null;
    for (const [index, check] of checks.entries()) {
      const checked = await check;
      if (!checked) continue;
      // A Wikidata site keeps its Wikidata evidence; the homepage adds the context.
      const site = wikidata.find((entry) => entry.match.domain === domains[index]);
      const result = site ? { ...checked, match: site.match } : checked;
      if (confirmed(result)) return withContext(result.match, result.hits, words);
      fallback ??= result;
    }
    signal.throwIfAborted();
    // Wikidata's label match outranks a guessed homepage.
    if (first) return withContext(first.match, first.hits, words);
    return fallback ? withContext(fallback.match, fallback.hits, words) : null;
  } finally {
    clearTimeout(grace);
    done.abort();
  }
}

// The tools

export function companyTools(budget: RunBudget): {
  readonly readWebPage: EnrichmentTool;
  readonly wikidataLookup: EnrichmentTool;
  readonly checkDomain: EnrichmentTool;
  readonly findCompanyWebsite: EnrichmentTool;
} {
  return {
    readWebPage: enrichmentTool(budget, {
      id: "readWebPage",
      kind: "read",
      description: [
        "Fetch a public web page, such as the company's homepage or its about, team, leadership or press page,",
        "and return its title, meta description, JSON-LD organisation and person data, icon and logo candidates,",
        "social links, links to about/team/contact pages, image candidates with their alt text, and a text excerpt.",
        "Pass `person` (a full name) on a team or person page to get, in `images`, only the images that name that",
        "person, and the text around their name; `otherPeopleImages` then lists photos whose alt text, caption or",
        "JSON-LD names someone else, for recordColleague's photoUrl, never for the person's avatar.",
        "LinkedIn, other off-limits sites and search engine results pages are refused.",
      ].join(" "),
      inputSchema: z.object({
        url: z.string().min(3).describe('Absolute URL, or a bare domain such as "acme.com".'),
        person: z.string().min(2).optional().describe("Full name of the person to look for on the page."),
      }),
      execute: ({ url, person }, run) => readWebPage(url, person, run),
    }),

    wikidataLookup: enrichmentTool(budget, {
      id: "wikidataLookup",
      kind: "lookup",
      description: [
        "Search Wikidata for a company or a person by name and return the best matches. Companies come with their",
        "official website, inception, headquarters, country, industry, employee count, stock exchange and logo;",
        "people with their employer and positions. Both include an image, an X username and a GitHub username",
        "when Wikidata has them. Well-known entities only: small companies are usually missing.",
      ].join(" "),
      inputSchema: z.object({
        name: z.string().min(2).describe("Company or person name."),
        type: z.enum(["company", "person"]).describe("Whether the name is a company or a person."),
      }),
      execute: async ({ name, type }, run) => {
        const matches = await wikidataEntities(name, type, run.signal);
        return { ok: true, matches: matches.slice(0, 3) };
      },
    }),

    checkDomain: enrichmentTool(budget, {
      id: "checkDomain",
      kind: "lookup",
      description: [
        "Check a domain or email address: whether it belongs to a personal email provider (such as gmail.com,",
        "which says nothing about the company), whether it resolves, and its MX records and mail provider.",
        "A domain with no DNS records suggests the company or domain doesn't exist.",
      ].join(" "),
      inputSchema: z.object({ domain: z.string().min(3).describe('A domain such as "acme.com", or an email address.') }),
      execute: ({ domain }, run) => checkDomain(domain, run.signal),
    }),

    findCompanyWebsite: enrichmentTool(budget, {
      id: "findCompanyWebsite",
      kind: "lookup",
      description: [
        "Find a company's own website from its name, when the input gives no domain. Tries Wikidata's official",
        "website first, then likely domains, accepting one only if it resolves and its homepage names the company.",
        "Returns the domain, the website and the evidence, or an error when nothing matches: then don't guess one.",
      ].join(" "),
      inputSchema: z.object({
        name: z.string().min(2).describe('The company name, such as "Fathom Analytics".'),
        context: z
          .string()
          .optional()
          .describe("What else is known (industry, location, the person's title), to tell same-named companies apart."),
      }),
      execute: async ({ name, context }, run) => {
        const match = await findCompanyWebsite(name, { context, signal: run.signal });
        return match
          ? { ok: true, ...match }
          : { ok: false, error: `No website found for "${name}". Don't guess a domain.` };
      },
    }),
  };
}
