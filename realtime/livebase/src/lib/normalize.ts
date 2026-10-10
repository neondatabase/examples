// Pure normalization shared by the server, which dedupes people and companies
// by email and domain, and the client, which formats and compares the
// same values. Uses only standard JavaScript, so it runs in Node and browsers.

// Webmail providers. An address at one of these says nothing about the
// person's employer, so it never creates or matches a company.
export const PERSONAL_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.de",
  "web.de",
  "mail.com",
  "yandex.ru",
  "qq.com",
  "163.com",
  "fastmail.com",
  "hey.com",
  "zoho.com",
]);

// Lowercase DNS labels joined by dots, ending in an alphabetic or punycode TLD.
// This rejects single labels such as "localhost", IP addresses, and spaces.
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

// Deliberately loose: dedupe needs a stable key, not RFC 5322 validation.
const EMAIL_LOCAL_PART = /^[^\s@<>()[\]\\,;:"]+$/;

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

// Second-level labels that companies register under, as in "acme.co.uk".
const GENERIC_SECOND_LEVEL_LABELS: ReadonlySet<string> = new Set([
  "ac",
  "co",
  "com",
  "edu",
  "gov",
  "ltd",
  "net",
  "org",
  "plc",
]);

export function normalizeEmail(value: string | null | undefined): string | null {
  const input = value?.trim().toLowerCase();
  if (!input) return null;
  // Models sometimes keep a "Name <...>" or "mailto:" wrapper from the pasted
  // text. Unwrap first, so "<mailto:jane@acme.com>" works too.
  const email = (/<([^<>]+)>\s*$/.exec(input)?.[1] ?? input)
    .trim()
    .replace(/^mailto:/, "")
    .trim();
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return EMAIL_LOCAL_PART.test(local) && HOSTNAME.test(domain) ? email : null;
}

export function emailDomain(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  return normalized ? normalized.slice(normalized.lastIndexOf("@") + 1) : null;
}

export function isPersonalEmailDomain(domain: string | null | undefined): boolean {
  const key = domain?.trim().toLowerCase().replace(/\.+$/, "");
  return key ? PERSONAL_EMAIL_DOMAINS.has(key) : false;
}

export function companyDomainFromEmail(email: string | null | undefined): string | null {
  const domain = emailDomain(email);
  if (!domain || isPersonalEmailDomain(domain)) return null;
  // The same canonical form as a website's domain, so both find one company.
  // Not `normalizeDomain` itself: its LinkedIn rule is for profile URLs, and
  // jane@linkedin.com does work at LinkedIn.
  const host = domain.replace(/^www\./, "");
  return HOSTNAME.test(host) ? host : null;
}

export function normalizeDomain(value: string | null | undefined): string | null {
  const input = value?.trim().toLowerCase();
  if (!input || /\s/.test(input)) return null;
  const rest = input.replace(URL_SCHEME, "").replace(/^\/\//, "");
  const authority = rest.split(/[/?#]/, 1)[0] ?? "";
  // An "@" before the path means an email address (or credentials), which
  // isn't a company's domain. Callers use `companyDomainFromEmail` for those.
  if (authority.includes("@")) return null;
  const host = authority
    .replace(/:\d*$/, "")
    .replace(/\.+$/, "")
    .replace(/^www\./, "");
  if (!HOSTNAME.test(host)) return null;
  // A LinkedIn profile URL identifies a person, not their company.
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return null;
  return host;
}

export function normalizeUrl(value: string | null | undefined): string | null {
  const input = value?.trim();
  if (!input || /\s/.test(input)) return null;
  const candidate = URL_SCHEME.test(input)
    ? input
    : input.startsWith("//")
      ? `https:${input}`
      : `https://${input}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  // Only web links are safe to render as hrefs. Credentials mean the input was
  // really an email address: "jane@acme.com" parses as user "jane".
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || !url.hostname.includes(".")) return null;
  // Drop the bare trailing slash that URL adds, so "acme.com" stays tidy.
  return url.pathname === "/" && !url.search && !url.hash
    ? url.href.slice(0, -1)
    : url.href;
}

export function normalizeName(value: string | null | undefined): string | null {
  // NFC so that composed and decomposed accents compare equal, both as stored
  // names and as `nameKey`s.
  const name = value?.normalize("NFC").replace(/\s+/g, " ").trim();
  return name ? name : null;
}

export function nameKey(value: string | null | undefined): string | null {
  return normalizeName(value)?.toLowerCase() ?? null;
}

export function companyNameFromDomain(domain: string): string {
  const host = normalizeDomain(domain) ?? domain.trim().toLowerCase();
  const labels = host.split(".").filter(Boolean);
  // Drop the TLD, then a generic second level, to reach the registered name:
  // "app.acme.com" and "acme.co.uk" both give "acme".
  if (labels.length > 1) labels.pop();
  const secondLevel = labels.at(-1);
  if (labels.length > 1 && secondLevel && GENERIC_SECOND_LEVEL_LABELS.has(secondLevel)) {
    labels.pop();
  }
  const label = labels.at(-1) ?? host;
  return label
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
