// Turns a fetched HTML page into the compact facts an enrichment agent needs:
// metadata, JSON-LD organisations and people, icon candidates, social links,
// links to about or team pages, image candidates, and a bounded text excerpt.
//
// Image candidates come with their alt and nearby text, and JSON-LD `image`,
// so the agent can find a headshot on the company's own site and colleagues'
// photos.

import { NodeType, parse, type HTMLElement, type Node } from "node-html-parser";

import { truncate } from "~/lib/format";
import { hostMatches } from "~/server/enrichment/web/safe-fetch";

export const socialHosts = [
  "x.com",
  "twitter.com",
  "github.com",
  "youtube.com",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "bsky.app",
  "mastodon.social",
  "fosstodon.org",
  "hachyderm.io",
  "discord.gg",
  "discord.com",
  "threads.net",
  "tiktok.com",
  "medium.com",
  "crunchbase.com",
];

const keyLinkPattern =
  /\b(about|team|company|leadership|management|people|founders|our-story|story|contact|press|newsroom|news|blog|careers|jobs|investors|customers)\b/i;

export interface IconCandidate {
  url: string;
  rel: string;
  sizes?: string;
  type?: string;
}

export interface JsonLdEntity {
  type: string;
  name?: string;
  url?: string;
  logo?: string;
  // Person and Organization `image`: often a headshot for a Person.
  image?: string;
  description?: string;
  foundingDate?: string;
  address?: string;
  numberOfEmployees?: string;
  sameAs?: string[];
  jobTitle?: string;
  worksFor?: string;
}

export interface ImageCandidate {
  // Absolute http(s); never a data: URI.
  readonly url: string;
  readonly alt: string | null;
  // A figcaption, or the heading and text of the image's own card, ≤ 120 chars.
  readonly nearbyText: string | null;
  // Declared attributes, when present. `checkImageUrl` measures the real size.
  readonly width: number | null;
  readonly height: number | null;
  readonly source: "img" | "jsonld" | "og";
}

export interface PageFacts {
  url: string;
  title?: string;
  description?: string;
  siteName?: string;
  ogImage?: string;
  jsonLd: JsonLdEntity[];
  icons: IconCandidate[];
  socialLinks: string[];
  keyLinks: { text: string; url: string }[];
  // Deduped, at most MAX_IMAGES: JSON-LD and og:image first, then <img> in
  // document order.
  images: ImageCandidate[];
  text: string;
}

const MAX_IMAGES = 30;
const NEARBY_CHARS = 120;
// Images declared smaller than this are icons, spacers or tracking pixels.
const MIN_DECLARED_PX = 32;
// How far up from an <img> to look for its card's text.
const MAX_CARD_DEPTH = 4;

export function extractPage(html: string, pageUrl: string, textChars = 4_000): PageFacts {
  const root = parse(html, {
    comment: false,
    blockTextElements: { script: true, style: true, noscript: true, pre: true },
  });
  const meta = (key: string) =>
    root.querySelector(`meta[property="${key}"]`)?.getAttribute("content") ??
    root.querySelector(`meta[name="${key}"]`)?.getAttribute("content") ??
    undefined;
  const absolute = (href: string | undefined) => {
    if (!href) return undefined;
    try {
      return new URL(href, pageUrl).href;
    } catch {
      return undefined;
    }
  };

  const icons: IconCandidate[] = [];
  for (const link of root.querySelectorAll("link[rel]")) {
    const rel = (link.getAttribute("rel") ?? "").toLowerCase();
    if (!/\b(icon|apple-touch-icon|apple-touch-icon-precomposed|mask-icon)\b/.test(rel)) continue;
    const url = absolute(link.getAttribute("href"));
    if (url) icons.push({ url, rel, sizes: link.getAttribute("sizes"), type: link.getAttribute("type") });
  }

  const pageHost = new URL(pageUrl).hostname.replace(/^www\./, "");
  const socialLinks = new Set<string>();
  const keyLinks = new Map<string, string>();
  for (const anchor of root.querySelectorAll("a[href]")) {
    const url = absolute(anchor.getAttribute("href"));
    if (!url || !/^https?:/.test(url)) continue;
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (socialHosts.some((s) => host === s || host.endsWith(`.${s}`))) {
      socialLinks.add(url.replace(/\/$/, ""));
    } else if (host === pageHost || host.endsWith(`.${pageHost}`)) {
      const text = oneLine(blockText(anchor)).slice(0, 60);
      if (keyLinkPattern.test(new URL(url).pathname) || keyLinkPattern.test(text)) {
        if (!keyLinks.has(url) && keyLinks.size < 20) keyLinks.set(url, text);
      }
    }
  }

  const jsonLd = root
    .querySelectorAll('script[type="application/ld+json"]')
    .flatMap((script) => parseJsonLd(script.rawText, absolute))
    .slice(0, 8);

  for (const node of root.querySelectorAll("script, style, noscript, svg, template, iframe")) node.remove();
  const body = root.querySelector("body") ?? root;
  const text = visibleText(body).slice(0, textChars);
  const ogImage = absolute(meta("og:image"));

  const images = new ImageList();
  for (const entity of jsonLd) {
    if (!entity.image) continue;
    images.add({
      url: entity.image,
      alt: null,
      nearbyText: entity.name ? truncate(`${entity.type}: ${oneLine(entity.name)}`, NEARBY_CHARS) : null,
      width: null,
      height: null,
      source: "jsonld",
    });
  }
  if (ogImage) {
    images.add({
      url: ogImage,
      // Only the image's own alt: og:title names the page, not the picture,
      // so it would tie a post's banner to its author.
      alt: meta("og:image:alt")?.trim() || null,
      nearbyText: null,
      width: pixels(meta("og:image:width")),
      height: pixels(meta("og:image:height")),
      source: "og",
    });
  }
  for (const img of body.querySelectorAll("img")) {
    if (images.full) break;
    const url = imageSource(img, absolute);
    if (!url) continue;
    const width = pixels(img.getAttribute("width"));
    const height = pixels(img.getAttribute("height"));
    if ((width !== null && width < MIN_DECLARED_PX) || (height !== null && height < MIN_DECLARED_PX)) continue;
    images.add({
      url,
      alt: oneLine(img.getAttribute("alt") ?? "") || null,
      nearbyText: nearbyText(img, body),
      width,
      height,
      source: "img",
    });
  }

  return {
    url: pageUrl,
    title: root.querySelector("title")?.textContent.trim() || undefined,
    description: meta("description") ?? meta("og:description"),
    siteName: meta("og:site_name"),
    ogImage,
    jsonLd,
    icons: icons.slice(0, 10),
    socialLinks: [...socialLinks].slice(0, 20),
    keyLinks: [...keyLinks].map(([url, text]) => ({ text, url })),
    images: images.list(),
    text,
  };
}

// Plain text of the page for relevance checks, without the extraction.
export function pageText(html: string): string {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, noscript: true } });
  for (const node of root.querySelectorAll("script, style, noscript, svg, template")) node.remove();
  const title = root.querySelector("title")?.textContent ?? "";
  const description = root.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
  return `${title}\n${description}\n${visibleText(root.querySelector("body") ?? root)}`;
}

// Honorifics and suffixes that a page may leave out of a name.
const NAME_NOISE: ReadonlySet<string> = new Set(["mr", "mrs", "ms", "mx", "dr", "prof", "jr", "sr", "ii", "iii", "phd"]);
// Letters that NFD doesn't decompose, folded to what an English page would write.
const LETTER_FOLDS: Readonly<Record<string, string>> = { ł: "l", ø: "o", đ: "d", ß: "ss", æ: "ae", œ: "oe", ı: "i" };

function nameWords(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[łøđßæœı]/g, (letter) => LETTER_FOLDS[letter] ?? letter)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// True when `text` names the person: every name token of 2 or more characters
// appears as a whole word, ignoring case and accents. "Zeno" alone doesn't
// name "Zeno Rocha", so a first-name-only caption never ties a photo to a
// person, and no avatar shows the wrong person.
export function namesPerson(text: string | null | undefined, personName: string): boolean {
  if (!text) return false;
  const tokens = nameWords(personName).filter((token) => token.length >= 2 && !NAME_NOISE.has(token));
  if (tokens.length === 0) return false;
  const words = new Set(nameWords(text));
  return tokens.every((token) => words.has(token));
}

// The page's images of the person, best first: a JSON-LD Person's own
// `image`, then an image whose alt text names them, then one whose caption or
// card text does. A JSON-LD candidate's nearby text is its entity's name, and
// an Organization named after a person isn't their photo, so it only counts
// through the Person entity. Group photos are left out (`isGroupPhoto`).
export function imagesOfPerson(page: PageFacts, personName: string): ImageCandidate[] {
  const personImages = new Set(
    page.jsonLd
      .filter((entity) => entity.type === "Person" && entity.image && namesPerson(entity.name, personName))
      .map((entity) => entity.image),
  );
  return page.images
    .map((image, index) => {
      let score = 0;
      if (personImages.has(image.url)) score = 3;
      else if (namesPerson(image.alt, personName) && !isGroupPhoto(image.alt, GROUP_ALT)) score = 2;
      else if (
        image.source !== "jsonld" &&
        namesPerson(image.nearbyText, personName) &&
        !isGroupPhoto(image.alt, GROUP_ALT) &&
        !isGroupPhoto(image.nearbyText, GROUP_CAPTION)
      ) {
        score = 1;
      }
      return { image, index, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.image);
}

// A photo of several people names each of them, so it isn't anyone's
// headshot: "The founders, from left to right: …", "Jane Doe and John Roe at
// the offsite". Alt text describes the picture itself, so it gets the broader
// test; a caption or card text only the explicit group phrases, because a
// card's "Head of People" or "Platform team" is just a title.
const GROUP_ALT: readonly RegExp[] = [
  /\b(?:team|founders|co-?founders|group|everyone|together|crew|staff|smiling|from left|left to right|l-r|(?:two|three|four|five|six|\d+) (?:people|of us|members))\b/i,
  // "Jane Doe and John Roe": two capitalised words either side of "and".
  /\p{Lu}\p{Ll}+ (?:and|&) \p{Lu}\p{Ll}+/u,
];
const GROUP_CAPTION: readonly RegExp[] = [/\b(?:from left|left to right|l-r|pictured|group photo|team photo)\b/i];

function isGroupPhoto(text: string | null, patterns: readonly RegExp[]): boolean {
  return text !== null && patterns.some((pattern) => pattern.test(text));
}

// Collects candidates in order, merging duplicates: a later candidate for the
// same URL fills in whatever the first one lacked.
class ImageList {
  private readonly byUrl = new Map<string, ImageCandidate>();

  get full(): boolean {
    return this.byUrl.size >= MAX_IMAGES;
  }

  add(candidate: ImageCandidate): void {
    if (!isUsableImageUrl(candidate.url)) return;
    const key = imageKey(candidate.url);
    const existing = this.byUrl.get(key);
    if (existing) {
      this.byUrl.set(key, {
        ...existing,
        alt: existing.alt ?? candidate.alt,
        nearbyText: existing.nearbyText ?? candidate.nearbyText,
        width: existing.width ?? candidate.width,
        height: existing.height ?? candidate.height,
      });
    } else if (!this.full) {
      this.byUrl.set(key, candidate);
    }
  }

  list(): ImageCandidate[] {
    return [...this.byUrl.values()];
  }
}

// Analytics and ad beacons that pages load as images.
const TRACKING_HOSTS = [
  "doubleclick.net",
  "google-analytics.com",
  "googletagmanager.com",
  "bat.bing.com",
  "scorecardresearch.com",
  "analytics.twitter.com",
  "ads.linkedin.com",
  "pixel.wp.com",
  "stats.wp.com",
];
// LinkedIn's image CDN. Its photos are LinkedIn content, which enrichment
// never fetches or cites.
const LINKEDIN_MEDIA_HOSTS = ["licdn.com"];
const PLACEHOLDER_PATH = /(?:^|[/_.-])(?:sprite|sprites|spacer|pixel|blank|transparent|1x1|tracking|beacon)(?:[/_.-]|$)/i;

// Image optimizers serve one source at several widths
// (`/_next/image?url=%2Fteam%2Fjane.jpg&w=640`); they count as one image.
function imageKey(raw: string): string {
  try {
    const url = new URL(raw);
    const source = url.searchParams.get("url");
    if (source && /\/_(?:next|vercel)\/image$/.test(url.pathname)) return new URL(source, url).href;
  } catch {
    // Not reachable: candidates are absolute URLs already.
  }
  return raw;
}

function isUsableImageUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname;
  if ([...TRACKING_HOSTS, ...LINKEDIN_MEDIA_HOSTS].some((domain) => hostMatches(host, domain))) return false;
  if (hostMatches(host, "facebook.com") && url.pathname.startsWith("/tr")) return false;
  return !PLACEHOLDER_PATH.test(url.pathname);
}

// The <img>'s real source. A lazy loader keeps it in a data- attribute and
// puts a placeholder in `src`, so those come first; then `src` unless it's a
// data: URI; then the best of `srcset`.
function imageSource(img: HTMLElement, absolute: (href: string | undefined) => string | undefined): string | null {
  for (const attribute of ["data-src", "data-lazy-src", "data-original", "src"]) {
    const value = img.getAttribute(attribute)?.trim();
    if (value && !/^(?:data|blob):/i.test(value)) return absolute(value) ?? null;
  }
  const srcset = img.getAttribute("srcset") ?? img.getAttribute("data-srcset");
  const best = srcset ? pickFromSrcset(srcset) : null;
  return best ? (absolute(best) ?? null) : null;
}

// The smallest candidate at least 256 px wide, which is plenty for an avatar,
// or else the widest. Entries without a width descriptor count as 0.
function pickFromSrcset(srcset: string): string | null {
  const entries = srcset
    .split(/,\s+/)
    .map((entry) => {
      const [url, descriptor] = entry.trim().split(/\s+/);
      const width = descriptor?.endsWith("w") ? Number.parseInt(descriptor, 10) : 0;
      return { url: url ?? "", width: Number.isFinite(width) ? width : 0 };
    })
    .filter((entry) => entry.url && !/^(?:data|blob):/i.test(entry.url));
  if (entries.length === 0) return null;
  const sorted = entries.sort((a, b) => a.width - b.width);
  return (sorted.find((entry) => entry.width >= 256) ?? sorted.at(-1))!.url;
}

// A declared pixel size: "64" or "64px". Percentages and junk are unknown.
function pixels(value: string | undefined): number | null {
  const match = value ? /^\s*(\d+)(?:px)?\s*$/i.exec(value) : null;
  return match ? Number(match[1]) : null;
}

// The text that labels an image: its figure's caption, or the heading and text
// of the smallest enclosing card. The walk stops at an ancestor that holds
// another image, because that text belongs to several people (a team grid),
// and tying it to one photo could put the wrong face on a person.
function nearbyText(img: HTMLElement, body: HTMLElement): string | null {
  let node = img.parentNode;
  for (let depth = 0; node && node !== body && depth < MAX_CARD_DEPTH; depth++, node = node.parentNode) {
    if (node.querySelectorAll("img").length > 1) return null;
    const all = oneLine(blockText(node));
    if (!all) continue;
    const label = node.querySelector("figcaption, h1, h2, h3, h4, h5, h6, strong, b");
    // The same text rules as `all`, so `head` is found inside it.
    const head = label ? oneLine(blockText(label)) : "";
    const rest = head ? oneLine(all.replace(head, "")) : all;
    return truncate(head && rest ? `${head} · ${rest}` : head || rest, NEARBY_CHARS);
  }
  return null;
}

function oneLine(text: string): string {
  return text.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

// Elements a browser lays out on their own line. `textContent` joins text
// nodes with nothing between them, so "<h2>About</h2><p>Team</p>" reads
// "AboutTeam": snippets read oddly, and a name glued to the next block ("Jane
// DoeCEO") isn't a whole word for `namesPerson`, `keyLinkPattern` or the
// copyright lines in `homepageNamesCompany`. Inline elements (a, span,
// strong, …) still join, as a browser renders them.
const BLOCK_TAGS: ReadonlySet<string> = new Set([
  "address", "article", "aside", "blockquote", "body", "caption", "dd", "details", "dialog", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup",
  "hr", "html", "legend", "li", "main", "menu", "nav", "ol", "option", "p", "pre", "section", "summary", "table",
  "tbody", "tfoot", "thead", "tr", "ul",
]);
// Table cells sit side by side, so a space keeps a row ("Jane Doe CEO") on
// one line.
const CELL_TAGS: ReadonlySet<string> = new Set(["td", "th"]);

// The element's decoded text, with a line break around each block element and
// at each <br>, and a space between table cells. `visibleText` and `oneLine`
// then collapse the extra whitespace. Iterative, so a deeply nested page can't
// overflow the stack.
function blockText(element: HTMLElement): string {
  const parts: string[] = [];
  const stack: (Node | string)[] = [element];
  while (stack.length > 0) {
    const item = stack.pop()!;
    if (typeof item === "string") {
      parts.push(item);
    } else if (item.nodeType === NodeType.TEXT_NODE) {
      parts.push(item.text);
    } else if (item.nodeType === NodeType.ELEMENT_NODE) {
      // The parse root has no tag name at runtime, though it's typed as a string.
      const tag = (item.rawTagName ?? "").toLowerCase();
      if (tag === "br") {
        parts.push("\n");
        continue;
      }
      const separator = BLOCK_TAGS.has(tag) ? "\n" : CELL_TAGS.has(tag) ? " " : "";
      if (separator) {
        parts.push(separator);
        stack.push(separator);
      }
      for (let index = item.childNodes.length - 1; index >= 0; index--) stack.push(item.childNodes[index]!);
    }
  }
  return parts.join("");
}

function visibleText(element: HTMLElement): string {
  return blockText(element)
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

const interestingTypes = /^(Organization|Corporation|LocalBusiness|OnlineBusiness|Brand|Person|WebSite|NewsMediaOrganization)$/;

function parseJsonLd(raw: string, absolute: (href: string | undefined) => string | undefined): JsonLdEntity[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const nodes: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (value && typeof value === "object") {
      const node = value as Record<string, unknown>;
      nodes.push(node);
      if (node["@graph"]) visit(node["@graph"]);
    }
  };
  visit(data);
  return nodes.flatMap((node) => {
    const type = [node["@type"]].flat().map(String).find((t) => interestingTypes.test(t));
    if (!type) return [];
    const str = (value: unknown): string | undefined => {
      if (typeof value === "string") return value;
      if (typeof value === "number") return String(value);
      // `image` and `logo` are often lists; the first is the primary one.
      if (Array.isArray(value)) return str(value[0]);
      if (value && typeof value === "object") {
        const v = value as Record<string, unknown>;
        return str(v.url ?? v.contentUrl ?? v.name ?? v.value ?? v["@id"]);
      }
      return undefined;
    };
    const address = node.address as Record<string, unknown> | string | undefined;
    const addressText =
      typeof address === "string"
        ? address
        : address
          ? [address.addressLocality, address.addressRegion, address.addressCountry].map(str).filter(Boolean).join(", ")
          : undefined;
    const employees = node.numberOfEmployees as Record<string, unknown> | undefined;
    const employeesText =
      employees && typeof employees === "object"
        ? (str(employees.value) ?? [str(employees.minValue), str(employees.maxValue)].filter(Boolean).join("-"))
        : str(employees);
    const image = type === "WebSite" ? undefined : absolute(str(node.image));
    return [
      {
        type,
        name: str(node.name),
        url: absolute(str(node.url)),
        logo: absolute(str(node.logo) ?? str(node.image)),
        image,
        description: str(node.description)?.slice(0, 400),
        foundingDate: str(node.foundingDate),
        address: addressText || undefined,
        numberOfEmployees: employeesText || undefined,
        sameAs: [node.sameAs].flat().map(str).filter((s): s is string => Boolean(s)).slice(0, 15),
        jobTitle: str(node.jobTitle),
        worksFor: str(node.worksFor),
      },
    ];
  });
}
