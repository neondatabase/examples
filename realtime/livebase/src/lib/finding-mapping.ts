import type { Company, Lead, Person, SubjectType } from "~/db/schema";
import {
  FINDING_LABELS,
  MAX_LENGTHS,
  MULTI_VALUED_FINDINGS,
  SENIORITIES,
  SIZE_BANDS,
  type FindingKey,
  type FindingLabel,
} from "~/lib/constants";
import {
  companyNameFromDomain,
  isPersonalEmailDomain,
  normalizeDomain,
  normalizeName,
  normalizeUrl,
} from "~/lib/normalize";

// Pure mapping from an enrichment finding to its canonical value, the columns
// it fills, and the rule that decides whether it may fill them.
// `persist.server.ts` applies the result inside one transaction; keeping the
// rules free of database access makes them easy to unit test, as
// `extraction-mapping.ts` does for extraction.

export type NormalizedFinding =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string };

export function isFindingLabel(subject: SubjectType, label: string): label is FindingLabel {
  return (FINDING_LABELS[subject] as readonly string[]).includes(label);
}

export function isMultiValuedFinding(subject: SubjectType, label: string): boolean {
  return MULTI_VALUED_FINDINGS.has(`${subject}.${label}` as FindingKey);
}

// Values

// Answers that mean "not found". Recording one would fill a column with noise,
// so the model is told to skip the field instead.
const PLACEHOLDERS: ReadonlySet<string> = new Set([
  "-",
  "?",
  "n/a",
  "na",
  "none",
  "not available",
  "not found",
  "null",
  "tbd",
  "undefined",
  "unknown",
]);

type Rule = (key: FindingKey, raw: string) => NormalizedFinding;

function ok(value: string): NormalizedFinding {
  return { ok: true, value };
}

function fail(message: string): NormalizedFinding {
  return { ok: false, message };
}

// NFC with collapsed whitespace, like a stored name, so equal facts compare
// equal however the model spaced them.
function text(max: number): Rule {
  return (key, raw) => {
    const value = normalizeName(raw);
    if (!value) return fail(`${key} is empty.`);
    if (PLACEHOLDERS.has(value.toLowerCase())) {
      return fail(`${key} "${value}" isn't a fact. Skip a field you couldn't find.`);
    }
    if (value.length > max) return fail(`${key} must be at most ${max} characters; this is ${value.length}.`);
    return ok(value);
  };
}

// An absolute http(s) URL. `normalizeUrl` alone would accept "acme.com/logo"
// by assuming https, but the model must give the URL it actually saw.
function url(max: number, canonical: (value: string) => string = (value) => value): Rule {
  return (key, raw) => {
    const input = raw.trim();
    const normalized = /^https?:\/\//i.test(input) ? normalizeUrl(input) : null;
    if (!normalized) return fail(`${key} must be an absolute http(s) URL.`);
    const value = canonical(normalized);
    if (value.length > max) return fail(`${key} must be at most ${max} characters; this is ${value.length}.`);
    return ok(value);
  };
}

const X_HOSTS: ReadonlySet<string> = new Set([
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
  "www.x.com",
  "mobile.x.com",
]);

// X links on twitter.com (or a www. or mobile. host) as https://x.com, so the
// same account recorded both ways dedupes and every X link looks alike. Only for profile links: image URLs are
// fetched and checked before they're normalized, so rewriting one would store
// a URL nobody checked (and X's images live on twimg.com anyway).
function canonicalProfileUrl(value: string): string {
  const url = new URL(value);
  if (!X_HOSTS.has(url.hostname)) return value;
  url.protocol = "https:";
  url.hostname = "x.com";
  return normalizeUrl(url.href) ?? value;
}

// Accepts a URL or a bare host, as `normalizeDomain` does, and stores the bare
// host. A webmail domain never identifies a company.
const domain: Rule = (key, raw) => {
  const value = normalizeDomain(raw);
  if (!value) return fail(`${key} must be a bare domain, such as "acme.com".`);
  if (isPersonalEmailDomain(value)) return fail(`${value} is a personal email provider, not a company's domain.`);
  return ok(value);
};

const sizeBand: Rule = (key, raw) => {
  // Tolerate "51 – 200" and "10,001+".
  const value = raw.trim().replace(/[‒-―]/g, "-").replace(/[\s,]/g, "");
  return (SIZE_BANDS as readonly string[]).includes(value)
    ? ok(value)
    : fail(`${key} must be one of ${SIZE_BANDS.map((band) => `"${band}"`).join(", ")}.`);
};

const seniority: Rule = (key, raw) => {
  const value = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (SENIORITIES as readonly string[]).includes(value)
    ? ok(value)
    : fail(`${key} must be one of ${SENIORITIES.map((level) => `"${level}"`).join(", ")}.`);
};

// A company can't be founded in the future. The floor matches the editor's
// validation in `records.ts`.
const foundedYear: Rule = (key, raw) => {
  const value = raw.trim();
  const year = /^\d{4}$/.test(value) ? Number(value) : Number.NaN;
  const latest = new Date().getUTCFullYear();
  return year >= 1000 && year <= latest
    ? ok(value)
    : fail(`${key} must be a four-digit year, no later than ${latest}.`);
};

// "YYYY-MM: headline". A full date is shortened to its month, so the same story
// recorded twice dedupes.
const recentNews: Rule = (key, raw) => {
  const match = /^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?\s*:\s*(\S[\s\S]*)$/.exec(raw.trim());
  if (!match) return fail(`${key} must be "YYYY-MM: headline".`);
  const [, year, month, rest] = match;
  const headline = text(MAX_LENGTHS.field - 9)(key, rest ?? "");
  return headline.ok ? ok(`${year}-${month}: ${headline.value}`) : headline;
};

// The model scores fit as an integer from 0 to 100, which it handles better
// than a fraction. Stored as a 0–1 decimal string, like `leads.fit_score` and
// `findings.confidence`. Built as text, so no float rounding creeps in.
const fitScore: Rule = (key, raw) => {
  const value = raw.trim().replace(/\s*%$/, "");
  const score = /^\d{1,3}$/.test(value) ? Number(value) : Number.NaN;
  if (!(score >= 0 && score <= 100)) return fail(`${key} must be an integer from 0 to 100.`);
  return ok(score === 100 ? "1.00" : `0.${String(score).padStart(2, "0")}`);
};

// Length caps match the editors' `maxLength`, so a user can still edit what
// the agent wrote (`MAX_LENGTHS`).
const RULES: Readonly<Record<FindingKey, Rule>> = {
  "company.name": text(MAX_LENGTHS.field),
  "company.domain": domain,
  "company.description": text(MAX_LENGTHS.field),
  "company.industry": text(MAX_LENGTHS.field),
  "company.size_band": sizeBand,
  "company.hq_location": text(MAX_LENGTHS.field),
  "company.founded_year": foundedYear,
  "company.logo_url": url(MAX_LENGTHS.url),
  "company.social_links": url(MAX_LENGTHS.field, canonicalProfileUrl),
  "company.recent_news": recentNews,
  "company.funding": text(MAX_LENGTHS.field),
  "person.name": text(MAX_LENGTHS.field),
  "person.title": text(MAX_LENGTHS.field),
  "person.seniority": seniority,
  "person.public_profiles": url(MAX_LENGTHS.field, canonicalProfileUrl),
  "person.avatar_url": url(MAX_LENGTHS.url),
  "lead.fit_score": fitScore,
  "lead.next_step": text(MAX_LENGTHS.nextStep),
};

// The canonical value for `findings.value`. A failure's message is shown to
// the model, so it says how to fix the call.
export function normalizeFindingValue(
  subject: SubjectType,
  label: FindingLabel,
  raw: string,
): NormalizedFinding {
  if (!isFindingLabel(subject, label)) {
    return fail(`"${label}" isn't a ${subject} label. Use one of: ${FINDING_LABELS[subject].join(", ")}.`);
  }
  const key = `${subject}.${label}` as FindingKey;
  return RULES[key](key, raw);
}

// Where a finding came from: an absolute http(s) URL, or nothing. A bad
// source isn't worth failing the fact over.
export function normalizeSourceUrl(raw: string | null | undefined): string | null {
  const input = raw?.trim();
  if (!input || !/^https?:\/\//i.test(input)) return null;
  const value = normalizeUrl(input);
  return value && value.length <= MAX_LENGTHS.url ? value : null;
}

export function normalizeConfidence(value: number): number | null {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
}

// Columns

export type FindingColumns =
  | {
    readonly table: "companies";
    readonly patch: Partial<Pick<
      Company,
      "name" | "domain" | "website" | "description" | "industry" | "sizeBand" | "location" | "logoUrl" | "foundedYear" | "funding"
    >>;
  }
  | {
    readonly table: "people";
    readonly patch: Partial<Pick<Person, "name" | "title" | "seniority" | "profileUrl" | "avatarUrl">>;
  }
  | { readonly table: "leads"; readonly patch: Partial<Pick<Lead, "fitScore" | "nextStep">> };

// The column(s) a canonical finding fills, or null for the labels that exist
// only as findings (social links, recent news). A domain also offers the
// website, the way extraction derives it; the first public profile offers the
// person's profile link. The column the label names always comes first
// (`namedColumn`).
export function findingColumns(subject: SubjectType, label: FindingLabel, value: string): FindingColumns | null {
  const key = `${subject}.${label}` as FindingKey;
  switch (key) {
    case "company.name": return { table: "companies", patch: { name: value } };
    case "company.domain": return { table: "companies", patch: { domain: value, website: `https://${value}` } };
    case "company.description": return { table: "companies", patch: { description: value } };
    case "company.industry": return { table: "companies", patch: { industry: value } };
    case "company.size_band": return { table: "companies", patch: { sizeBand: value } };
    case "company.hq_location": return { table: "companies", patch: { location: value } };
    case "company.founded_year": return { table: "companies", patch: { foundedYear: Number(value) } };
    case "company.logo_url": return { table: "companies", patch: { logoUrl: value } };
    case "company.funding": return { table: "companies", patch: { funding: value } };
    case "company.social_links":
    case "company.recent_news":
      return null;
    case "person.name": return { table: "people", patch: { name: value } };
    case "person.title": return { table: "people", patch: { title: value } };
    case "person.seniority": return { table: "people", patch: { seniority: value } };
    case "person.public_profiles": return { table: "people", patch: { profileUrl: value } };
    case "person.avatar_url": return { table: "people", patch: { avatarUrl: value } };
    case "lead.fit_score": return { table: "leads", patch: { fitScore: Number(value) } };
    case "lead.next_step": return { table: "leads", patch: { nextStep: value } };
  }
  return null;
}

// The column a label names, by Drizzle key, or null for finding-only labels.
// `findings.filled` records whether a finding wrote this column. A domain's
// website is only derived from it, so filling the website alone doesn't count:
// that finding still hasn't written the domain the user or extraction set.
export function namedColumn(subject: SubjectType, label: FindingLabel): string | null {
  // Any value will do: only the patch's keys are read.
  const columns = findingColumns(subject, label, "0");
  return columns ? Object.keys(columns.patch)[0] ?? null : null;
}

// The column values of the agent's latest *filled* finding per label for one
// subject (`findings.filled`): the `agentValues` for `fillableColumns`. A
// finding that wrote nothing, because it only repeated a user's or
// extraction's value, must not be passed in, or that value would count as the
// agent's own and the next finding would replace it. Multi-valued labels
// are left out. Each of their findings is one of several, so a later profile
// doesn't replace the profile link an earlier one filled: they fill an empty
// column only.
export function agentColumnValues(
  subject: SubjectType,
  latest: Iterable<{ readonly label: string; readonly value: string }>,
): Partial<Record<string, unknown>> {
  const values: Partial<Record<string, unknown>> = {};
  for (const { label, value } of latest) {
    if (!isFindingLabel(subject, label) || isMultiValuedFinding(subject, label)) continue;
    Object.assign(values, findingColumns(subject, label, value)?.patch);
  }
  return values;
}

// A company name that code made up rather than anyone supplied: extraction
// names a company after its domain ("usefathom.com" gives "Usefathom") when
// the input doesn't name it. The fill rule treats that name like the agent's
// own, so the real one ("Fathom Analytics") can replace it, but only while an
// agent wrote the row last. After a user edit to the company, it stays.
export function derivedCompanyValues(
  company: Pick<Company, "name" | "domain" | "updatedBy">,
): Partial<Pick<Company, "name">> {
  if (company.updatedBy !== "agent" || !company.domain) return {};
  const derived = companyNameFromDomain(company.domain);
  return company.name === derived ? { name: derived } : {};
}

// The fill rule. An agent fills a column when it's empty, or when it still
// holds the agent's own latest finding for that field, one that wrote it
// (`agentColumnValues`). Anything else came from the user, or from extraction,
// which came from the user's own input, and is never overwritten. So enrichment
// never replaces an extracted title or next step: its finding is still recorded
// and shown, but the column keeps the extracted value. Columns whose value
// wouldn't change are dropped, so a repeated finding writes nothing and flashes
// nothing. Like the findings' dedup, that ignores case: a repeat in other case
// isn't news.
export function fillableColumns<Row extends object>(
  row: Row,
  patch: Partial<Row>,
  agentValues: Partial<Record<keyof Row, unknown>>,
): Partial<Row> {
  const fill: Partial<Row> = {};
  for (const column of Object.keys(patch) as (keyof Row)[]) {
    const next = patch[column];
    if (next == null) continue;
    const current = row[column];
    if (sameValue(current, next, { ignoreCase: true })) continue;
    const agentValue = agentValues[column];
    if (isEmpty(current) || (agentValue != null && sameValue(current, agentValue))) fill[column] = next;
  }
  return fill;
}

// The fill rule for a company, with its two special cases. A name extraction
// derived from the domain counts as the agent's own (`derivedCompanyValues`),
// unless the agent has a latest name of its own, which wins. And a
// domain's website follows the domain: it fills only when the domain does, or
// when the row already holds that domain. Otherwise a domain the rule keeps
// out would still fill the website with a site that disagrees with it.
export function fillableCompanyColumns<Row extends Pick<Company, "name" | "domain" | "website" | "updatedBy">>(
  row: Row,
  patch: Partial<Row>,
  agentValues: Partial<Record<keyof Row, unknown>>,
): Partial<Row> {
  const fill = fillableColumns(row, patch, { ...derivedCompanyValues(row), ...agentValues });
  const domain = patch.domain;
  if (domain != null && fill.domain === undefined && row.domain?.toLowerCase() !== domain.toLowerCase()) {
    delete fill.website;
  }
  return fill;
}

function isEmpty(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

// Numbers compare as numbers, so a `real` column read back as 0.72 equals the
// finding's "0.72", and 2015 equals "2015". Text compares after the same
// whitespace and NFC normalization the findings get. By default case counts:
// a user who only fixed the case of a value has still edited it.
function sameValue(a: unknown, b: unknown, { ignoreCase = false } = {}): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === "number" || typeof b === "number") {
    // Number("") is 0, which isn't the same as a blank.
    if (isEmpty(a) || isEmpty(b)) return false;
    const x = Number(a);
    const y = Number(b);
    // `real` is single precision, so allow for its rounding.
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 1e-6;
  }
  if (typeof a === "string" && typeof b === "string") {
    const x = normalizeName(a);
    const y = normalizeName(b);
    return ignoreCase ? x?.toLowerCase() === y?.toLowerCase() : x === y;
  }
  return a === b;
}
