// Where logos and avatars come from, and the order to try them in. Pure, so
// the order is tested without a DOM; the loading and stepping down happen in
// `FallbackImage`.

export interface ImageSource {
  readonly url: string;
  // Images are hot-linked, so most sources get no referrer: third parties
  // don't learn which lead page asked. Brandfetch is the exception (below).
  readonly referrerPolicy: "no-referrer" | "strict-origin";
  // A loaded image whose shorter side is below this counts as a failure, so
  // the next source gets its turn. 0 accepts any image that decodes.
  readonly minPx: number;
}

// Requested at twice the largest box a logo is drawn in (`xl`, 56 px) for
// sharp high-density screens. One size for every box, so the browser caches
// one copy per company.
const LOGO_PX = 128;

// The agent records `company.logo_url` only for images at least 32 px across,
// so a favicon that small is treated the same way: below it, a monogram
// looks better than an upscaled blur.
const MIN_FAVICON_PX = 32;

// Brandfetch's square icon for the domain. `fallback/404` makes an unknown
// brand a 404, so the image errors and the next source is tried; the default
// fallbacks would load a transparent or placeholder image and stop the chain.
export function brandfetchIconUrl(domain: string, clientId: string): string {
  const size = `w/${LOGO_PX}/h/${LOGO_PX}`;
  return `https://cdn.brandfetch.io/domain/${encodeURIComponent(domain)}/${size}/fallback/404/type/icon?c=${encodeURIComponent(clientId)}`;
}

// Google's favicon service. An unknown domain still gets an image (a 16 px
// globe, with a 404 status that browsers render anyway), which `minPx` rejects.
export function faviconServiceUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${LOGO_PX}`;
}

export interface LogoInputs {
  readonly domain: string | null;
  readonly logoUrl: string | null;
}

// In order: Brandfetch when a client ID is configured, then the logo the
// agent recorded, then the favicon service. The domain is known early (from
// the email or the agent's first finding), so the first and last appear well
// before the agent gets to `logo_url`. An empty list means the monogram.
export function companyLogoSources(company: LogoInputs, brandfetchClientId: string | null): ImageSource[] {
  const domain = present(company.domain);
  const logoUrl = present(company.logoUrl);
  const sources: ImageSource[] = [];
  if (domain && brandfetchClientId) {
    // Brandfetch's Logo API guidelines require a referrer carrying the
    // embedding site's origin. `strict-origin` sends only that, never the
    // path, so lead IDs stay private.
    sources.push({ url: brandfetchIconUrl(domain, brandfetchClientId), referrerPolicy: "strict-origin", minPx: 0 });
  }
  if (logoUrl) sources.push({ url: logoUrl, referrerPolicy: "no-referrer", minPx: 0 });
  if (domain) sources.push({ url: faviconServiceUrl(domain), referrerPolicy: "no-referrer", minPx: MIN_FAVICON_PX });
  return dedupe(sources);
}

// What a logo's `Flash` watches: it changes exactly when the logo's inputs
// (the domain or the recorded logo) do, so a write that brings or changes a
// logo flashes, and a load failure, which isn't a write, doesn't.
export function companyLogoKey(company: LogoInputs, brandfetchClientId: string | null): string | null {
  const sources = companyLogoSources(company, brandfetchClientId);
  return sources.length > 0 ? sources.map((source) => source.url).join(" ") : null;
}

// The person's recorded avatar (`people.avatar_url`), already checked by the
// agent to be an image at least 64 px across. An empty list means the
// monogram.
export function avatarSources(avatarUrl: string | null | undefined): ImageSource[] {
  const url = present(avatarUrl);
  return url ? [{ url, referrerPolicy: "no-referrer", minPx: 0 }] : [];
}

// The source to show: the first that hasn't failed in this element, or null
// once all have (the monogram).
export function firstUsable(sources: readonly ImageSource[], failed: ReadonlySet<string>): ImageSource | null {
  return sources.find((source) => !failed.has(source.url)) ?? null;
}

// Whether a loaded image is too small for its source. A zero size is not
// "too small": an SVG without intrinsic dimensions reports 0 in some browsers.
export function tooSmall(width: number, height: number, minPx: number): boolean {
  const shorter = Math.min(width, height);
  return minPx > 0 && shorter > 0 && shorter < minPx;
}

function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// An agent could record the favicon service's own URL as the logo; trying it
// twice would only delay the monogram.
function dedupe(sources: ImageSource[]): ImageSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}
