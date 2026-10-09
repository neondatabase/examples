// Research tools for the lead's own person: Gravatar for their email address,
// and the X API for a handle that is already tied to them. Also the pure
// helpers for the avatar order and the avatar URL formats, which the record
// tools and the prompt rely on.
//
// Both tools call fixed API hosts, so they use global `fetch` with the run's
// signal plus a timeout, never URLs the model supplies. Expected
// failures (no profile, unknown handle, a refused token) come back as
// `{ ok: false, error }` for the model to read.

import { createHash } from "node:crypto";
import { z } from "zod";

import { normalizeEmail } from "~/lib/normalize";
import { enrichmentTool, type EnrichmentTool, type RunBudget } from "~/server/enrichment/budget";
import { FETCH_LIMITS, type EnrichmentKeys } from "~/server/enrichment/config";
import { isOffLimits } from "~/server/enrichment/web/safe-fetch";

// The avatar sources, best first. `recordFinding` won't let a
// worse-ranked method replace an avatar within a run, and the model must
// name the method it used.
export const AVATAR_METHODS = ["gravatar", "x", "company_site", "github"] as const;
export type AvatarMethod = (typeof AVATAR_METHODS)[number];

export function avatarRank(method: AvatarMethod): number {
  return AVATAR_METHODS.indexOf(method);
}

// 400 px matches X's largest square size, and Brandfetch's icons. The UI shows
// avatars far smaller, so this is plenty for a sharp image on any screen.
const AVATAR_SIZE = 400;

// X API pay-per-use price for one user read: $0.010 per user returned, and a
// user read again on the same UTC day isn't billed twice
// (https://docs.x.com/x-api/getting-started/pricing, checked 2026-10-04).
// A lookup that finds no user returns no resource, so it isn't charged.
export const X_USER_READ_USD = 0.01;

const X_USER_FIELDS = "profile_image_url,name,description,url,verified,verified_type,entities";

// X usernames are 1–15 letters, digits and underscores.
const X_HANDLE = /^[a-z0-9_]{1,15}$/i;

// First path segments on x.com that are app routes, not users.
const X_RESERVED_PATHS: ReadonlySet<string> = new Set([
  "explore",
  "hashtag",
  "home",
  "i",
  "intent",
  "login",
  "messages",
  "notifications",
  "search",
  "settings",
  "share",
  "signup",
  "tos",
  "privacy",
]);

const X_HOSTS: ReadonlySet<string> = new Set(["x.com", "twitter.com"]);

const BIO_CHARS = 400;
const MAX_ACCOUNTS = 8;

// Gravatar's own rule: the SHA-256 of the trimmed, lower-cased address.
export function gravatarHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

// `d=404` makes a miss a 404 rather than Gravatar's generated placeholder, so
// both the lookup and the record tool's image check can tell there's no photo,
// and an avatar the person later removes falls back to the monogram.
export function gravatarAvatarUrl(email: string, size: number = AVATAR_SIZE): string {
  const s = Math.min(2048, Math.max(1, Math.round(size)));
  return `https://gravatar.com/avatar/${gravatarHash(email)}?s=${s}&d=404`;
}

// X returns a 48 px "_normal" image. The same path with "_400x400" is the
// largest square size. Other size suffixes are swapped too.
export function xImage400(profileImageUrl: string): string {
  return profileImageUrl.replace(
    /_(?:normal|bigger|mini|reasonably_small|200x200|400x400)(\.[a-z0-9]+)?(?=$|[?#])/i,
    "_400x400$1",
  );
}

// The egg (or silhouette) X shows for an account with no photo of its own.
// It isn't a picture of the person, so it's never an avatar.
function isDefaultXImage(url: string): boolean {
  return /\/default_profile_images\//.test(url);
}

// A bare X username from "@zeno", "zeno", "x.com/zeno", "twitter.com/zeno?s=1"
// or a status URL, lower-cased because X handles are case-insensitive. Null for
// anything that isn't one handle on x.com or twitter.com.
export function normalizeXHandle(value: string): string | null {
  const input = value.trim();
  if (!input) return null;
  if (input.startsWith("@")) {
    const handle = input.slice(1);
    return X_HANDLE.test(handle) ? handle.toLowerCase() : null;
  }
  if (X_HANDLE.test(input)) return input.toLowerCase();

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(?:www|mobile|m)\./, "");
  if (!X_HOSTS.has(host)) return null;
  // Old links put the handle in a "#!/zeno" fragment.
  const path = url.pathname === "/" && url.hash.startsWith("#!/") ? url.hash.slice(2) : url.pathname;
  const segment = decodeURIComponent(path.split("/").filter(Boolean)[0] ?? "").replace(/^@/, "");
  if (!X_HANDLE.test(segment) || X_RESERVED_PATHS.has(segment.toLowerCase())) return null;
  return segment.toLowerCase();
}

// github.com/<user>.png redirects to the avatar on avatars.githubusercontent.com,
// and `size` picks a square size. The record tool's image check follows the
// redirect and keeps the final URL.
export function githubAvatarUrl(username: string, size: number = AVATAR_SIZE): string {
  const user = username.trim().replace(/^@/, "");
  const s = Math.min(460, Math.max(1, Math.round(size)));
  return `https://github.com/${encodeURIComponent(user)}.png?size=${s}`;
}

export function peopleTools(
  budget: RunBudget,
  keys: EnrichmentKeys,
  person: { readonly email: string | null },
): {
  readonly lookupGravatar?: EnrichmentTool;
  readonly lookupXProfile?: EnrichmentTool;
} {
  const email = normalizeEmail(person.email);
  const xBearerToken = keys.xBearerToken;
  return {
    // Skipped without an email: there's nothing to hash.
    ...(email !== null && {
      lookupGravatar: enrichmentTool(budget, {
        id: "lookupGravatar",
        kind: "lookup",
        description: [
          "Look up the Gravatar for the lead's own email address (already known; takes no input).",
          "The match is exact, so a returned avatarUrl is a photo the person chose: record it as",
          'person.avatar_url with method "gravatar". When a profile exists it may also give their',
          "name, job title, company and verified accounts, including an X handle that is tied to them.",
          "Call it once, before any other avatar source.",
        ].join(" "),
        inputSchema: z.object({}),
        execute: async (_input, run) => lookupGravatar(email, keys.gravatarApiKey, run.signal),
      }),
    }),
    // Not registered without a token.
    ...(xBearerToken !== null && {
      lookupXProfile: enrichmentTool(budget, {
        id: "lookupXProfile",
        kind: "x",
        description: [
          "Look up an X (Twitter) user by username and return their name, bio, website, verified",
          "status and a 400×400 profile photo (avatarUrl). Only for a handle already tied to the",
          "person: linked from the company's or their own site, a verified Gravatar account, or",
          "Wikidata, or found by search where the profile's name matches and its bio or website names",
          "the company. Never guess a handle from a name. Check the returned name and bio before",
          'recording the photo as person.avatar_url with method "x".',
        ].join(" "),
        inputSchema: z.object({
          username: z.string().min(1).describe('The handle, such as "zenorocha", "@zenorocha" or "x.com/zenorocha".'),
          reason: z
            .string()
            .min(3)
            .describe('How the handle is tied to the person, e.g. "linked from resend.com/about".'),
        }),
        execute: async ({ username }, run) => lookupXProfile(username, xBearerToken, run),
      }),
    }),
  };
}

function apiSignal(signal: AbortSignal): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(FETCH_LIMITS.timeoutMs)]);
}

// --- Gravatar ---------------------------------------------------------------

// The fields of GET https://api.gravatar.com/v3/profiles/{sha256} that this
// tool reads. Unauthenticated calls return the public summary; a Bearer key
// adds first/last name and links, and raises the rate limit from 100 to 1,000
// an hour (checked 2026-10-04).
export interface GravatarProfile {
  readonly display_name?: string;
  readonly first_name?: string;
  readonly last_name?: string;
  readonly profile_url?: string;
  readonly job_title?: string;
  readonly company?: string;
  readonly location?: string;
  readonly description?: string;
  readonly verified_accounts?: readonly {
    readonly service_type?: string;
    readonly service_label?: string;
    readonly url?: string;
    readonly is_hidden?: boolean;
  }[];
  readonly links?: readonly { readonly label?: string; readonly url?: string }[];
}

async function lookupGravatar(email: string, apiKey: string | null, signal: AbortSignal) {
  const [avatar, profile] = await Promise.allSettled([
    gravatarAvatarExists(email, signal),
    apiKey ? gravatarProfile(email, apiKey, signal) : Promise.resolve(null),
  ]);
  // allSettled swallows rejections, so re-raise a cancel or timeout of the run.
  signal.throwIfAborted();
  if (avatar.status === "rejected" && profile.status === "rejected") throw avatar.reason;

  const avatarUrl = avatar.status === "fulfilled" && avatar.value ? gravatarAvatarUrl(email) : null;
  const found = profile.status === "fulfilled" ? profile.value : null;
  if (!avatarUrl && !found) {
    return { ok: false, error: "No Gravatar avatar or profile for the lead's email address." };
  }
  return {
    ok: true,
    avatarUrl,
    ...(found && gravatarSummary(found)),
    ...(avatar.status === "rejected" && { avatarError: errorMessage(avatar.reason) }),
    ...(profile.status === "rejected" && { profileError: errorMessage(profile.reason) }),
  };
}

async function gravatarAvatarExists(email: string, signal: AbortSignal): Promise<boolean> {
  const response = await fetch(gravatarAvatarUrl(email), {
    method: "HEAD",
    headers: { "user-agent": FETCH_LIMITS.userAgent },
    signal: apiSignal(signal),
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Gravatar avatar check returned HTTP ${response.status}`);
  return (response.headers.get("content-type") ?? "").startsWith("image/");
}

async function gravatarProfile(email: string, apiKey: string, signal: AbortSignal): Promise<GravatarProfile | null> {
  const response = await fetch(`https://api.gravatar.com/v3/profiles/${gravatarHash(email)}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
      "user-agent": FETCH_LIMITS.userAgent,
    },
    signal: apiSignal(signal),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Gravatar profile API returned HTTP ${response.status}`);
  return (await response.json()) as GravatarProfile;
}

// The profile fields worth recording, with empty strings dropped and
// off-limits hosts (LinkedIn and so on) removed, so they're never cited.
// A verified X account becomes `xHandle`, since it counts as tied to them.
export function gravatarSummary(profile: GravatarProfile) {
  const text = (value: string | undefined, max = 200) => {
    const trimmed = value?.replace(/\s+/g, " ").trim();
    return trimmed ? trimmed.slice(0, max) : undefined;
  };
  const allowed = (url: string | undefined): url is string => Boolean(url && /^https?:\/\//i.test(url) && !isOffLimits(url));

  const accounts = (profile.verified_accounts ?? [])
    .filter((account) => !account.is_hidden && allowed(account.url))
    .slice(0, MAX_ACCOUNTS)
    .map((account) => ({ service: account.service_label ?? account.service_type ?? "other", url: account.url! }));
  const x = (profile.verified_accounts ?? []).find(
    (account) => !account.is_hidden && account.service_type === "twitter" && account.url,
  );
  const links = (profile.links ?? [])
    .filter((link) => allowed(link.url))
    .slice(0, MAX_ACCOUNTS)
    .map((link) => ({ label: text(link.label, 80) ?? link.url!, url: link.url! }));
  const fullName = [text(profile.first_name), text(profile.last_name)].filter(Boolean).join(" ");

  return {
    profileUrl: text(profile.profile_url),
    displayName: text(profile.display_name),
    fullName: fullName || undefined,
    jobTitle: text(profile.job_title),
    company: text(profile.company),
    location: text(profile.location),
    about: text(profile.description, BIO_CHARS),
    xHandle: (x?.url && normalizeXHandle(x.url)) || undefined,
    verifiedAccounts: accounts,
    links: links.length ? links : undefined,
  };
}

// --- X ----------------------------------------------------------------------

// The fields of GET https://api.x.com/2/users/by/username/:username that this
// tool reads. `url` and links in `description` are t.co short links, and
// `entities` carries their expansions.
interface XUrlEntity {
  readonly url?: string;
  readonly expanded_url?: string;
}

export interface XUser {
  readonly id?: string;
  readonly username?: string;
  readonly name?: string;
  readonly description?: string;
  readonly url?: string;
  readonly profile_image_url?: string;
  readonly verified?: boolean;
  readonly verified_type?: string;
  readonly entities?: {
    readonly url?: { readonly urls?: readonly XUrlEntity[] };
    readonly description?: { readonly urls?: readonly XUrlEntity[] };
  };
}

interface XUserResponse {
  readonly data?: XUser;
  readonly errors?: readonly { readonly title?: string; readonly detail?: string }[];
  readonly title?: string;
  readonly detail?: string;
}

async function lookupXProfile(username: string, token: string, budget: RunBudget) {
  const handle = normalizeXHandle(username);
  if (!handle) {
    return { ok: false, error: `"${username.slice(0, 80)}" isn't an X username (1–15 letters, digits or underscores).` };
  }
  const url = `https://api.x.com/2/users/by/username/${handle}?${new URLSearchParams({ "user.fields": X_USER_FIELDS })}`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, "user-agent": FETCH_LIMITS.userAgent },
    signal: apiSignal(budget.signal),
  });
  const body = (await response.json().catch(() => ({}))) as XUserResponse;

  if (response.status === 429) {
    return { ok: false, error: "X API rate limit reached. Don't call lookupXProfile again in this run." };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      error: `X API refused the request (HTTP ${response.status}${body.title ? `: ${body.title}` : ""}). Don't call lookupXProfile again in this run.`,
    };
  }
  if (!response.ok) throw new Error(`X API returned HTTP ${response.status}${body.title ? `: ${body.title}` : ""}`);
  // An unknown or suspended user is a 200 with `errors` and no `data`.
  if (!body.data) {
    return { ok: false, error: `No X user @${handle}${body.errors?.[0]?.title ? ` (${body.errors[0].title})` : ""}.` };
  }

  budget.addCost("x", X_USER_READ_USD);
  return { ok: true, ...xProfileSummary(body.data, handle) };
}

// The X user as the model sees it: t.co links expanded, the bio capped, and
// the photo at 400 × 400, or null for X's default image.
export function xProfileSummary(user: XUser, handle: string) {
  const expand = (text: string, entities: readonly XUrlEntity[] | undefined) =>
    (entities ?? []).reduce(
      (out, entity) => (entity.url && entity.expanded_url ? out.split(entity.url).join(entity.expanded_url) : out),
      text,
    );
  const username = user.username ?? handle;
  const image = user.profile_image_url;
  const website = user.url ? expand(user.url, user.entities?.url?.urls) : null;
  const bio = user.description ? expand(user.description, user.entities?.description?.urls).trim() : "";
  return {
    username,
    profileUrl: `https://x.com/${username}`,
    name: user.name ?? null,
    bio: bio ? bio.slice(0, BIO_CHARS) : null,
    website: website || null,
    verified: user.verified ?? false,
    ...(user.verified_type && user.verified_type !== "none" && { verifiedType: user.verified_type }),
    avatarUrl: image && !isDefaultXImage(image) ? xImage400(image) : null,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
