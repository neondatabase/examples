import type { Lead } from "~/db/schema";
import {
  companyDomainFromEmail,
  companyNameFromDomain,
  isPersonalEmailDomain,
  nameKey,
  normalizeDomain,
  normalizeEmail,
  normalizeName,
  normalizeUrl,
} from "~/lib/normalize";
// A type-only import: nothing from the server module loads at runtime.
import type { Extraction } from "~/server/mastra/extraction-agent.server";

// Pure mapping from an extraction, checked against the raw input it came from,
// to the rows it fills and the keys that find existing people and companies.
// `persist.server.ts` applies the result; keeping the rules free of database
// access makes them easy to unit test.

// `leads.value` is an `integer` column: a model-invented deal size above this
// would fail the whole extraction write.
const MAX_DEAL_VALUE = 2_147_483_647;

// Companies

export interface CompanyFields {
  readonly name: string;
  readonly domain: string | null;
  readonly website: string | null;
}

// A personal mailbox or a profile site never identifies a company.
function companyDomain(value: string | null | undefined): string | null {
  const domain = normalizeDomain(value);
  return domain && !isPersonalEmailDomain(domain) ? domain : null;
}

// The host names the raw input writes: in a URL, as a bare domain, or after
// the "@" of an email address. Splitting on every character a host can't hold
// isolates each one ("https://linear.app/about" and "karri@linear.app" both
// give "linear.app"), in linear time however long the input. Each piece goes
// through `normalizeDomain`, so hosts compare with its output: lower-cased,
// without "www.", and never LinkedIn.
export function mentionedHosts(rawText: string): ReadonlySet<string> {
  const hosts = new Set<string>();
  for (const piece of rawText.toLowerCase().split(/[^a-z0-9.-]+/)) {
    // Sentence punctuation: "see acme.com." ends with a dot.
    const host = normalizeDomain(piece.replace(/^[.-]+|[.-]+$/g, ""));
    if (host) hosts.add(host);
  }
  return hosts;
}

// True when the input names the domain or one of its subdomains, so a note
// linking blog.cloudflare.com supports cloudflare.com. A subdomain the input
// doesn't name ("app.acme.com" for a note saying "acme.com") isn't supported.
export function isMentioned(domain: string, hosts: ReadonlySet<string>): boolean {
  for (const host of hosts) {
    if (host === domain || host.endsWith(`.${domain}`)) return true;
  }
  return false;
}

// The company's domain and website come only from the raw input. The extraction
// model fills domains in from memory for well-known names, against its
// instructions: for "Karri Saarinen, CEO at Linear", with no URL in the note,
// it once returned linear.io, a parked domain that resolves. Enrichment treats
// the record as true, and the fill rule never replaces an extraction value, so
// a recalled domain would stick and show another company's logo. So a stated
// domain or website survives only when the input names its domain. A name-only
// lead then gets its domain from enrichment's `findCompanyWebsite`, which
// checks DNS and the homepage. The work-email fallback isn't checked: it
// matches the person's stored email, and the model may rebuild an address the
// note spells out ("jane at acme dot com"), which a literal match would miss.
export function companyFields({ company, person }: Extraction, rawText: string): CompanyFields | null {
  const hosts = mentionedHosts(rawText);
  const statedDomain = (value: string | null | undefined): string | null => {
    const domain = companyDomain(value);
    return domain && isMentioned(domain, hosts) ? domain : null;
  };
  const websiteDomain = statedDomain(company?.website);
  const domain = statedDomain(company?.domain)
    ?? websiteDomain
    ?? companyDomainFromEmail(normalizeEmail(person?.email));
  const name = normalizeName(company?.name) ?? (domain ? companyNameFromDomain(domain) : null);
  if (!name) return null;
  const website = (websiteDomain ? normalizeUrl(company?.website) : null)
    ?? (domain ? `https://${domain}` : null);
  return { name, domain, website };
}

export type CompanyKey =
  | { readonly by: "domain"; readonly domain: string }
  | { readonly by: "name"; readonly name: string; readonly withoutDomain: boolean };

// The lookups that find an existing company, tried in order. The domain comes
// first. A same-name company with no domain yet is the same company seen
// earlier in a name-only note, so it matches too and gains the domain rather
// than a twin. A same-name company with another domain doesn't.
export function companyKeys({ name, domain }: CompanyFields): CompanyKey[] {
  const keys: CompanyKey[] = domain ? [{ by: "domain", domain }] : [];
  const key = nameKey(name);
  if (key) keys.push({ by: "name", name: key, withoutDomain: domain !== null });
  return keys;
}

// People

export interface PersonFields {
  readonly name: string | null;
  readonly email: string | null;
  readonly title: string | null;
  readonly profileUrl: string | null;
}

export function personFields({ person }: Extraction): PersonFields | null {
  const name = normalizeName(person?.name);
  const email = normalizeEmail(person?.email);
  if (!name && !email) return null;
  return {
    name,
    email,
    title: normalizeName(person?.title),
    profileUrl: normalizeUrl(person?.profileUrl),
  };
}

export type PersonKey =
  | { readonly by: "email"; readonly email: string }
  | { readonly by: "name"; readonly name: string; readonly companyId: string };

// Deduplicate by email, or by name within the same company. A bare name with
// no company is too weak a match, so it always creates a new person.
export function personKey({ name, email }: PersonFields, companyId: string | null): PersonKey | null {
  if (email) return { by: "email", email };
  const key = nameKey(name);
  return key && companyId ? { by: "name", name: key, companyId } : null;
}

// Leads

type LeadFill = Pick<Lead, "title" | "stage" | "value" | "summary" | "nextStep" | "personId" | "companyId">;

// The lead columns an extraction fills. The user may have typed a title or
// moved the stage while extraction ran, so those only replace the defaults.
export function leadPatch(
  lead: LeadFill,
  { lead: fields }: Extraction,
  links: Pick<Lead, "personId" | "companyId">,
): Partial<LeadFill> {
  const title = clean(fields.title);
  return {
    ...(lead.title === "" && title ? { title } : {}),
    ...(lead.stage === "new" && fields.stage ? { stage: fields.stage } : {}),
    ...missing(lead, {
      value: dealValue(fields.value),
      summary: clean(fields.summary),
      nextStep: clean(fields.nextStep),
      ...links,
    }),
  };
}

// Helpers

// The subset of `values` whose columns are still empty on `row`. Extraction
// fills gaps and never overwrites what a user or an earlier run already set.
export function missing<Row extends object>(row: Row, values: Partial<Row>): Partial<Row> {
  const patch: Partial<Row> = {};
  for (const key of Object.keys(values) as (keyof Row)[]) {
    if (values[key] != null && row[key] == null) patch[key] = values[key];
  }
  return patch;
}

export function clean(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

export function dealValue(value: number | null): number | null {
  return value !== null && Number.isInteger(value) && value >= 0 && value <= MAX_DEAL_VALUE ? value : null;
}
