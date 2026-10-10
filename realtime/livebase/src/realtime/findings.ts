import type { Finding, SubjectType } from "~/db/schema";
import { FINDING_LABELS, MULTI_VALUED_FINDINGS, type FindingKey } from "~/lib/constants";
import { humanizeLabel, truncate } from "~/lib/format";
import { normalizeUrl } from "~/lib/normalize";

// What the findings list shows, and how. Pure, so it's tested without a
// browser, and shared with the activity timeline's step labels.

// Display names for finding labels, singular because each finding holds one
// value: a company with three social links shows three "Social link" rows.
const FINDING_NAMES: Record<FindingKey, string> = {
  "company.name": "Company name",
  "company.domain": "Domain",
  "company.description": "Description",
  "company.industry": "Industry",
  "company.size_band": "Company size",
  "company.hq_location": "HQ location",
  "company.founded_year": "Founded",
  "company.logo_url": "Logo",
  "company.social_links": "Social link",
  "company.recent_news": "News",
  "company.funding": "Funding",
  "person.name": "Name",
  "person.title": "Title",
  "person.seniority": "Seniority",
  "person.public_profiles": "Profile",
  "person.avatar_url": "Avatar",
  "lead.fit_score": "Fit score",
  "lead.next_step": "Next step",
};

// `SENIORITIES` as words. The rest humanize well enough ("Founder").
const SENIORITY_NAMES: Readonly<Record<string, string>> = {
  c_level: "C-level",
  vp: "VP",
};

// A URL shown as text is cut to this, after dropping its scheme.
const MAX_URL_CHARS = 60;

// A finding's display name. Labels outside `FINDING_LABELS` (older rows) are
// humanized instead.
export function findingLabelName(subject: string, label: string): string {
  return FINDING_NAMES[`${subject}.${label}` as FindingKey] ?? humanizeLabel(label);
}

// The findings worth showing, in `FINDING_LABELS` order: the latest finding of
// each single-valued label, and the latest of each distinct value of a
// multi-valued one. Persistence already skips a repeat of the latest value,
// but a rerun can record a value an earlier run had, or switch back to
// it. Values compare case-insensitively, as persistence's dedup does. Order
// is stable as findings arrive, so a new fact slots into its place instead of
// pushing the others down. "Latest" is persistence's order, `created_at`
// then `id`, both descending (ids are UUIDv7), so the list shows the value
// the column took. Browser times have only millisecond precision, so two
// findings of a parallel step can tie here.
export function visibleFindings(findings: readonly Finding[]): Finding[] {
  const newestFirst = [...findings].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );
  const seen = new Set<string>();
  const visible: Finding[] = [];
  for (const finding of newestFirst) {
    const key = [finding.subjectId, finding.label, isMultiValued(finding) ? valueKey(finding.value) : ""].join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    visible.push(finding);
  }
  // Array sort is stable, so findings of the same label stay newest first.
  return visible.sort((a, b) => labelRank(a) - labelRank(b));
}

export type FindingDisplay =
  | { readonly kind: "image"; readonly url: string; readonly shape: "round" | "square" }
  | { readonly kind: "score"; readonly value: number }
  | { readonly kind: "link"; readonly href: string; readonly text: string }
  | { readonly kind: "text"; readonly text: string };

// How to show a finding's canonical value (`normalizeFindingValue`): avatars
// and logos as images, the fit score as a meter from its stored 0–1 value,
// and profile and social links as links. A value that doesn't have the
// expected form falls back to plain text, so a bad row still shows.
export function findingDisplay(finding: Pick<Finding, "subjectType" | "label" | "value">): FindingDisplay {
  const { value } = finding;
  switch (`${finding.subjectType}.${finding.label}`) {
    case "person.avatar_url":
    case "company.logo_url": {
      // Agents copy image URLs from web pages, so only http(s) ones load.
      const url = normalizeUrl(value);
      if (!url) return { kind: "text", text: value };
      return { kind: "image", url, shape: finding.label === "avatar_url" ? "round" : "square" };
    }
    case "lead.fit_score": {
      const score = Number(value);
      return value.trim() !== "" && Number.isFinite(score) && score >= 0 && score <= 1
        ? { kind: "score", value: score }
        : { kind: "text", text: value };
    }
    case "company.social_links":
    case "person.public_profiles": {
      const href = normalizeUrl(value);
      return href ? { kind: "link", href, text: compactUrl(href) ?? href } : { kind: "text", text: value };
    }
    case "company.size_band":
      return { kind: "text", text: `${value.replace("-", "–")} employees` };
    case "person.seniority":
      return { kind: "text", text: SENIORITY_NAMES[value] ?? humanizeLabel(value) };
    default:
      return { kind: "text", text: value };
  }
}

// "https://www.github.com/zenorocha/?tab=repos" → "github.com/zenorocha". Null
// for anything that isn't an http(s) URL. A URL without a scheme is read as
// https, as `normalizeUrl` does.
export function compactUrl(url: string | null | undefined): string | null {
  const href = normalizeUrl(url);
  if (!href) return null;
  const parsed = new URL(href);
  const host = parsed.hostname.replace(/^www\./, "");
  const path = parsed.pathname.replace(/\/+$/, "");
  return truncate(`${host}${path}`, MAX_URL_CHARS);
}

function isMultiValued(finding: Finding): boolean {
  return MULTI_VALUED_FINDINGS.has(`${finding.subjectType}.${finding.label}` as FindingKey);
}

function valueKey(value: string): string {
  return value.trim().toLowerCase();
}

// Unknown labels sort after the known ones.
function labelRank(finding: Finding): number {
  const labels: readonly string[] = FINDING_LABELS[finding.subjectType as SubjectType] ?? [];
  const index = labels.indexOf(finding.label);
  return index === -1 ? labels.length : index;
}
