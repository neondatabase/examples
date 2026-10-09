import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import {
  companies,
  findings,
  leadInputs,
  leads,
  people,
  type Company,
  type Lead,
  type LeadStatus,
  type Person,
  type SubjectType,
} from "~/db/schema";
import { PROCESSING_STATUSES, type FindingLabel } from "~/lib/constants";
import {
  companyFields,
  companyKeys,
  leadPatch,
  missing,
  personFields,
  personKey,
  type CompanyFields,
  type PersonFields,
} from "~/lib/extraction-mapping";
import {
  agentColumnValues,
  fillableColumns,
  fillableCompanyColumns,
  findingColumns,
  isMultiValuedFinding,
  namedColumn,
  normalizeConfidence,
  normalizeFindingValue,
  normalizeSourceUrl,
  type FindingColumns,
} from "~/lib/finding-mapping";
import { newId } from "~/lib/ids";
import { companyNameFromDomain, nameKey } from "~/lib/normalize";
import type { EnrichmentContext, LeadRef } from "~/lib/types";
import type { Extraction } from "~/server/mastra/extraction-agent.server";

import { db, type Tx } from "./db.server";

// The agents' only path into the domain tables. Every write is scoped by
// workspace and conditional on the lead still existing and not being archived,
// so a run that finishes after an archive or delete is dropped quietly. A false
// result, or a "lead_gone" one from the enrichment writes, means exactly that.

// The last-writer columns that let the UI highlight agent writes.
function agentWrite(traceId: string | null) {
  return { updatedBy: "agent" as const, updatedByTraceId: traceId, updatedAt: new Date() };
}

type AgentWrite = ReturnType<typeof agentWrite>;

export async function loadLeadInput(ref: LeadRef): Promise<{ rawText: string } | null> {
  const [input] = await db
    .select({ rawText: leadInputs.rawText })
    .from(leadInputs)
    .innerJoin(leads, eq(leads.id, leadInputs.leadId))
    .where(and(
      eq(leadInputs.leadId, ref.leadId),
      eq(leadInputs.workspaceId, ref.workspaceId),
      eq(leads.workspaceId, ref.workspaceId),
      eq(leads.archived, false),
    ))
    .orderBy(leadInputs.createdAt)
    .limit(1);
  return input ?? null;
}

// `rawText` is the input the extraction came from: a company domain or website
// the input doesn't name is dropped (`companyFields`), so a domain the model
// recalled never reaches the record.
export async function applyExtraction(
  input: LeadRef & { extraction: Extraction; rawText: string; traceId: string | null },
): Promise<boolean> {
  const { leadId, workspaceId, extraction, rawText, traceId } = input;
  return db.transaction(async (tx) => {
    // The row lock makes a concurrent archive or delete wait for this
    // transaction, or win before it, so the check below can't go stale.
    const [lead] = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId)))
      .for("update");
    if (!lead || lead.archived) return false;

    const writer = agentWrite(traceId);
    const companyId = (await resolveCompany(tx, workspaceId, companyFields(extraction, rawText), writer))?.id ?? null;
    const personId = await resolvePerson(tx, workspaceId, personFields(extraction), companyId, writer);

    await tx
      .update(leads)
      .set({
        ...leadPatch(lead, extraction, { personId, companyId }),
        status: "enriching",
        statusDetail: null,
        ...writer,
      })
      .where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId)));

    await tx
      .update(leadInputs)
      .set({ kind: extraction.inputKind })
      .where(and(eq(leadInputs.leadId, leadId), eq(leadInputs.workspaceId, workspaceId)));

    return true;
  });
}

// Status isn't user-editable, so a status write leaves the last-writer columns
// alone: they drive the user and agent highlights.
export async function setLeadStatus(input: LeadRef & {
  status: LeadStatus;
  statusDetail?: string | null;
  onlyIf?: readonly LeadStatus[];
}): Promise<boolean> {
  const { leadId, workspaceId, status, statusDetail, onlyIf } = input;
  const changed = await db
    .update(leads)
    // Drizzle skips undefined values, so an omitted detail stays as it is.
    .set({ status, statusDetail, updatedAt: new Date() })
    .where(and(
      eq(leads.id, leadId),
      eq(leads.workspaceId, workspaceId),
      eq(leads.archived, false),
      onlyIf ? inArray(leads.status, [...onlyIf]) : undefined,
    ))
    .returning({ id: leads.id });
  return changed.length > 0;
}

export async function loadEnrichmentSnapshot(
  ref: LeadRef,
): Promise<Omit<EnrichmentContext, "signal"> | null> {
  const { leadId, workspaceId } = ref;
  const [row] = await db
    .select({ lead: leads, person: people, company: companies })
    .from(leads)
    .leftJoin(people, and(eq(people.id, leads.personId), eq(people.workspaceId, workspaceId)))
    .leftJoin(companies, and(eq(companies.id, leads.companyId), eq(companies.workspaceId, workspaceId)))
    .where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId), eq(leads.archived, false)));
  if (!row) return null;

  const input = await loadLeadInput(ref);
  if (!input) return null;

  const { lead, person, company } = row;
  const colleagues = company
    ? await db
      .select()
      .from(people)
      .where(and(
        eq(people.workspaceId, workspaceId),
        eq(people.companyId, company.id),
        person ? ne(people.id, person.id) : undefined,
      ))
      .orderBy(people.createdAt)
    : [];

  return { leadId, workspaceId, lead, person, company, colleagues, rawText: input.rawText };
}

// Runs once at startup, across every workspace: no run survives a restart, so
// a lead still marked as processing would otherwise spin forever.
// Archived leads are included, so that they read correctly if restored. Like
// `setLeadStatus`, it leaves the last-writer columns alone.
export async function failInterruptedLeads(): Promise<number> {
  const failed = await db
    .update(leads)
    .set({
      status: "failed",
      statusDetail: "Interrupted by a server restart",
      updatedAt: new Date(),
    })
    .where(inArray(leads.status, [...PROCESSING_STATUSES]))
    .returning({ id: leads.id });
  return failed.length;
}

// Enrichment
//
// Each call is one transaction that locks the lead, so an archive, delete, or
// user edit either lands before it or waits for it. The subject is
// resolved from the current lead row, not from run-side state, so a rerun
// after an edit starts from what the lead holds now. Database errors throw:
// the record tools let them fail the lead, while the research tools turn
// their own failures into results the model can read.
//
// Locks are taken in one order, the lead, then a domain (`lockDomain`), then
// companies, then people, so concurrent runs and extractions wait for each
// other rather than deadlock. A user edit locks a single row.

export interface FindingWrite extends LeadRef {
  readonly traceId: string | null;
  readonly subject: SubjectType;
  readonly label: FindingLabel;
  // Raw from the model: `normalizeFindingValue` makes it canonical.
  readonly value: string;
  readonly sourceUrl: string | null;
  readonly confidence: number; // 0–1
  readonly signal?: AbortSignal;
}

export type FindingResult =
  | {
    readonly ok: true;
    // Null when the same value was already the latest finding, so no row was added.
    readonly findingId: string | null;
    readonly subjectId: string;
    // The columns written on the subject, by Drizzle key ("sizeBand").
    readonly filled: readonly string[];
    // The lead's links after the write: recording a domain may link or re-point the company.
    readonly companyId: string | null;
    readonly personId: string | null;
  }
  | {
    readonly ok: false;
    readonly reason: "lead_gone" | "no_subject" | "invalid_value";
    readonly message: string; // shown to the model
  };

export interface ColleagueWrite extends LeadRef {
  readonly traceId: string | null;
  readonly name: string;
  readonly title: string | null;
  readonly avatarUrl: string | null; // already image-checked by the caller, or null
  readonly profileUrl: string | null;
  readonly sourceUrl: string | null;
  readonly confidence: number;
  readonly signal?: AbortSignal;
}

export type ColleagueResult =
  | { readonly ok: true; readonly personId: string; readonly created: boolean }
  | {
    readonly ok: false;
    readonly reason: "lead_gone" | "no_company" | "is_lead_person" | "invalid_value";
    readonly message: string;
  };

const LEAD_GONE = {
  ok: false,
  reason: "lead_gone",
  message: "The lead was archived or deleted, so nothing was recorded. Stop working on it.",
} as const;

// Records one fact and fills the column it maps to, under the fill rule
// (`fillableColumns`).
export async function persistFinding(input: FindingWrite): Promise<FindingResult> {
  const { workspaceId, subject, label, signal } = input;
  signal?.throwIfAborted();
  const normalized = normalizeFindingValue(subject, label, input.value);
  if (!normalized.ok) return { ok: false, reason: "invalid_value", message: normalized.message };
  const value = normalized.value;
  const writer = agentWrite(input.traceId);

  return db.transaction(async (tx): Promise<FindingResult> => {
    const lead = await lockLead(tx, input);
    if (!lead) return LEAD_GONE;
    // A cancel that arrived while this waited for the lock must not write.
    signal?.throwIfAborted();
    // Before any company row, in the lock order above, so a concurrent claim of
    // the same domain waits for this one to commit.
    if (subject === "company" && label === "domain") await lockDomain(tx, workspaceId, value);

    let companyId = lead.companyId;
    const filled: string[] = [];
    let target: SubjectRow | undefined;

    if (subject === "lead") {
      target = { table: "leads", row: lead };
    } else if (subject === "person") {
      const person = lead.personId ? await lockPerson(tx, workspaceId, lead.personId) : undefined;
      if (!person) {
        return { ok: false, reason: "no_subject", message: "The lead has no person, so person facts can't be recorded." };
      }
      target = { table: "people", row: person };
    } else {
      let company = companyId ? await lockCompany(tx, workspaceId, companyId) : undefined;
      if (!company) {
        // The first company fact links one, found or created by the same keys
        // extraction uses, except that a name alone links only a company with
        // no domain (`linkByName`). Anything else needs a company first.
        const fields = companyFieldsFromFinding(label, value);
        const linked = fields ? await linkCompany(tx, lead, fields, writer) : null;
        if (!linked) {
          return {
            ok: false,
            reason: "no_subject",
            message: "The lead has no company yet. Record company.domain or company.name first.",
          };
        }
        filled.push(...linked.filled);
        company = linked.company;
      } else if (label === "domain") {
        company = await claimDomain(tx, lead, company, value, writer);
      }
      companyId = company.id;
      target = { table: "companies", row: company };
    }

    const applied = await applyFinding(tx, {
      workspaceId,
      leadId: lead.id,
      traceId: input.traceId,
      target,
      subject,
      label,
      value,
      sourceUrl: normalizeSourceUrl(input.sourceUrl),
      confidence: normalizeConfidence(input.confidence),
      writer,
      linked: filled,
    });
    // A cancel can also land while this waited for a later lock (the person,
    // the company, a domain) or ran the statements since. Throwing rolls the
    // whole write back, which leaves only the COMMIT round trip open.
    signal?.throwIfAborted();
    return {
      ok: true,
      findingId: applied.findingId,
      subjectId: target.row.id,
      filled: [...new Set([...filled, ...applied.filled])],
      companyId,
      personId: lead.personId,
    };
  });
}

// Adds or updates a colleague: a person at the lead's company, matched by name.
// Their title and photo are also recorded as findings about them, with the
// source page, so the provenance survives without cluttering the lead's own
// findings. The caller enforces the per-run cap (`MAX_COLLEAGUES`).
export async function persistColleague(input: ColleagueWrite): Promise<ColleagueResult> {
  const { workspaceId, signal } = input;
  signal?.throwIfAborted();
  const fields = colleagueFields(input);
  if (!fields.ok) return { ok: false, reason: "invalid_value", message: fields.message };
  const { name, title, avatarUrl, profileUrl } = fields;
  const writer = agentWrite(input.traceId);

  return db.transaction(async (tx): Promise<ColleagueResult> => {
    const lead = await lockLead(tx, input);
    if (!lead) return LEAD_GONE;
    signal?.throwIfAborted();

    // Locking the company serializes colleague writes across leads at the same
    // company, so two runs can't both add the same person.
    const company = lead.companyId ? await lockCompany(tx, workspaceId, lead.companyId) : undefined;
    if (!company) {
      return {
        ok: false,
        reason: "no_company",
        message: "The lead has no company yet. Record company.domain or company.name before its colleagues.",
      };
    }

    const key = nameKey(name);
    if (lead.personId) {
      const [own] = await tx
        .select({ name: people.name })
        .from(people)
        .where(and(eq(people.id, lead.personId), eq(people.workspaceId, workspaceId)));
      if (own && nameKey(own.name) === key) {
        return {
          ok: false,
          reason: "is_lead_person",
          message: `${name} is the lead's own person. Record their facts with recordFinding instead.`,
        };
      }
    }

    const [existing] = await tx
      .select()
      .from(people)
      .where(and(
        eq(people.workspaceId, workspaceId),
        eq(people.companyId, company.id),
        sameNameAs(people.name, name),
      ))
      .orderBy(people.createdAt)
      .limit(1)
      .for("update");

    let personId: string;
    let latest: LatestFinding[] = [];
    // Whether this call wrote the column each provenance finding names.
    let wrote: { readonly title: boolean; readonly avatarUrl: boolean };
    if (existing) {
      personId = existing.id;
      latest = await latestFindings(tx, workspaceId, "person", personId);
      const own = await latestFindings(tx, workspaceId, "person", personId, { filledOnly: true });
      const agentValues = agentColumnValues("person", own);
      // A colleague's photo fills only an empty avatar. The avatar order holds
      // only within a run, so another lead's team-page photo must not
      // replace a better-ranked one, such as the person's own Gravatar.
      delete agentValues.avatarUrl;
      const patch = fillableColumns(existing, { title, avatarUrl, profileUrl }, agentValues);
      if (Object.keys(patch).length > 0) {
        await tx
          .update(people)
          .set({ ...patch, ...writer })
          .where(and(eq(people.id, personId), eq(people.workspaceId, workspaceId)));
      }
      wrote = { title: patch.title !== undefined, avatarUrl: patch.avatarUrl !== undefined };
    } else {
      personId = newId();
      // Colleagues come from a public page, so there's never an email.
      await tx.insert(people).values({
        id: personId,
        workspaceId,
        companyId: company.id,
        name,
        email: null,
        title,
        avatarUrl,
        profileUrl,
        ...writer,
      });
      wrote = { title: title !== null, avatarUrl: avatarUrl !== null };
    }

    const provenance = { workspaceId, leadId: lead.id, traceId: input.traceId, subjectId: personId, latest };
    const sourceUrl = normalizeSourceUrl(input.sourceUrl);
    const confidence = normalizeConfidence(input.confidence);
    if (title) {
      await insertFinding(tx, {
        ...provenance, subject: "person", label: "title", value: title, sourceUrl, confidence, filled: wrote.title,
      });
    }
    if (avatarUrl) {
      await insertFinding(tx, {
        ...provenance, subject: "person", label: "avatar_url", value: avatarUrl, sourceUrl, confidence, filled: wrote.avatarUrl,
      });
    }

    // As in `persistFinding`: a cancel during a later lock wait rolls back.
    signal?.throwIfAborted();
    return { ok: true, personId, created: !existing };
  });
}

type SubjectRow =
  | { readonly table: "companies"; readonly row: Company }
  | { readonly table: "people"; readonly row: Person }
  | { readonly table: "leads"; readonly row: Lead };

interface LatestFinding {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly filled: boolean;
}

async function lockLead(tx: Tx, { leadId, workspaceId }: LeadRef): Promise<Lead | undefined> {
  // As in `applyExtraction`: the lock makes a concurrent archive or delete wait
  // for this transaction, or win before it, so the check can't go stale.
  const [lead] = await tx
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId)))
    .for("update");
  return lead && !lead.archived ? lead : undefined;
}

// People and companies are shared by every lead that links them, so
// locking the row serializes the findings and fills of concurrent runs, and
// keeps a user's edit from landing between the fill rule's read and its write.
async function lockCompany(tx: Tx, workspaceId: string, id: string): Promise<Company | undefined> {
  const [company] = await tx
    .select()
    .from(companies)
    .where(and(eq(companies.id, id), eq(companies.workspaceId, workspaceId)))
    .for("update");
  return company;
}

async function lockPerson(tx: Tx, workspaceId: string, id: string): Promise<Person | undefined> {
  const [person] = await tx
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.workspaceId, workspaceId)))
    .for("update");
  return person;
}

// Serializes the transactions that may give a company this domain, until this
// one ends. Row locks can't: two companies claiming one new domain each lock
// only their own row, both see no holder, and the second then fails on the
// unique key, which fails its lead. With this lock the second waits, then sees
// the first's company as the holder and moves to it (`claimDomain`). A
// transaction may take it more than once.
async function lockDomain(tx: Tx, workspaceId: string, domain: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${workspaceId}/${domain}`}, 0))`);
}

// Case-insensitive name equality, lowered on both sides in SQL. A key lowered
// in JS can miss its own row, because `toLowerCase` and Postgres's `lower`
// disagree outside ASCII under some collations, such as a C-locale database.
function sameNameAs(column: typeof people.name | typeof companies.name, name: string | null) {
  return sql`lower(${column}) = lower(${name})`;
}

// The company a name or domain finding describes, in extraction's terms.
function companyFieldsFromFinding(label: FindingLabel, value: string): CompanyFields | null {
  if (label === "name") return { name: value, domain: null, website: null };
  if (label === "domain") return { name: companyNameFromDomain(value), domain: value, website: `https://${value}` };
  return null;
}

// Links a lead that has no company yet, and its person when they have none.
async function linkCompany(
  tx: Tx,
  lead: Lead,
  fields: CompanyFields,
  writer: AgentWrite,
): Promise<{ company: Company; filled: string[] } | null> {
  const { workspaceId } = lead;
  let resolved: ResolvedCompany | null;
  if (fields.domain === null) {
    resolved = await linkByName(tx, workspaceId, fields.name, writer);
  } else {
    // A found company goes through the fill rule like any other finding.
    const existing = await findCompany(tx, workspaceId, fields);
    resolved = existing ? { id: existing.id, written: [] } : await resolveCompany(tx, workspaceId, fields, writer);
  }
  if (!resolved) return null;
  const company = await lockCompany(tx, workspaceId, resolved.id);
  if (!company) return null;

  await repoint(tx, lead, null, company.id, writer);
  return { company, filled: resolved.written };
}

// A name alone is weak evidence, because namesakes are common. So it links
// only a same-name company with no domain yet, the kind a name-only note
// makes, and otherwise creates a company with no domain. A later
// `company.domain` then moves the lead to that domain's holder
// (`claimDomain`), instead of the lead staying on a namesake whose domain
// keeps out the right one.
async function linkByName(tx: Tx, workspaceId: string, name: string, writer: AgentWrite): Promise<ResolvedCompany> {
  const [found] = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.workspaceId, workspaceId), isNull(companies.domain), sameNameAs(companies.name, name)))
    .orderBy(companies.createdAt)
    .limit(1)
    .for("update");
  if (found) return { id: found.id, written: [] };
  const id = newId();
  await tx.insert(companies).values({ id, workspaceId, name, domain: null, website: null, ...writer });
  return { id, written: ["name"] };
}

// Another company in the workspace may already hold the domain (the unique
// key): the lead's company is then a twin, typically one extraction made from
// a name. The lead, and its person when they were at the twin, move to the
// holder, and the finding fills there. The twin stays, because other leads may
// share it. Only a domain the fill rule would write is claimed: a domain kept
// from the user or extraction keeps its company.
async function claimDomain(
  tx: Tx,
  lead: Lead,
  company: Company,
  domain: string,
  writer: AgentWrite,
): Promise<Company> {
  const { workspaceId } = lead;
  const own = await latestFindings(tx, workspaceId, "company", company.id, { filledOnly: true });
  const fill = fillableColumns(company, { domain }, agentColumnValues("company", own));
  if (fill.domain === undefined) return company;

  const [holder] = await tx
    .select()
    .from(companies)
    .where(and(eq(companies.workspaceId, workspaceId), eq(companies.domain, domain), ne(companies.id, company.id)))
    .orderBy(companies.createdAt)
    .limit(1)
    .for("update");
  if (!holder) return company;

  await repoint(tx, lead, company.id, holder.id, writer);
  return holder;
}

// Points the lead at `to`, and its person too when the person's company is
// `from` (null: they have none).
async function repoint(tx: Tx, lead: Lead, from: string | null, to: string, writer: AgentWrite): Promise<void> {
  const { workspaceId } = lead;
  await tx
    .update(leads)
    .set({ companyId: to, ...writer })
    .where(and(eq(leads.id, lead.id), eq(leads.workspaceId, workspaceId)));
  if (!lead.personId) return;
  await tx
    .update(people)
    .set({ companyId: to, ...writer })
    .where(and(
      eq(people.id, lead.personId),
      eq(people.workspaceId, workspaceId),
      from === null ? isNull(people.companyId) : eq(people.companyId, from),
    ));
}

// The latest finding per label for one subject, newest first by time and then
// by UUIDv7: what the dedup compares against. With `filledOnly`, the latest
// that wrote its column: the agent's own values for the fill rule. A finding
// that only repeated a user's or extraction's value wrote nothing, so it
// doesn't make that value the agent's.
async function latestFindings(
  tx: Tx,
  workspaceId: string,
  subject: SubjectType,
  subjectId: string,
  { filledOnly = false } = {},
): Promise<LatestFinding[]> {
  return tx
    .selectDistinctOn([findings.label], {
      id: findings.id,
      label: findings.label,
      value: findings.value,
      filled: findings.filled,
    })
    .from(findings)
    .where(and(
      eq(findings.workspaceId, workspaceId),
      eq(findings.subjectType, subject),
      eq(findings.subjectId, subjectId),
      filledOnly ? eq(findings.filled, true) : undefined,
    ))
    .orderBy(findings.label, desc(findings.createdAt), desc(findings.id));
}

interface FindingRow {
  readonly workspaceId: string;
  readonly leadId: string;
  readonly traceId: string | null;
  readonly subject: SubjectType;
  readonly subjectId: string;
  readonly label: FindingLabel;
  readonly value: string; // canonical
  readonly sourceUrl: string | null;
  readonly confidence: number | null;
  // The subject's latest findings, read before this insert.
  readonly latest: readonly LatestFinding[];
  // Whether this finding wrote the column its label names (`namedColumn`).
  readonly filled: boolean;
}

// Inserts the finding unless it repeats one: the latest for a single-valued
// label, or any earlier one for a multi-valued label. Values are canonical, so
// comparing them case-insensitively is enough. Returns the new ID, or null.
async function insertFinding(tx: Tx, finding: FindingRow): Promise<string | null> {
  const { workspaceId, subject, subjectId, label, value, filled } = finding;
  const [repeated] = isMultiValuedFinding(subject, label)
    ? await tx
      .select({ id: findings.id, filled: findings.filled })
      .from(findings)
      .where(and(
        eq(findings.workspaceId, workspaceId),
        eq(findings.subjectType, subject),
        eq(findings.subjectId, subjectId),
        eq(findings.label, label),
        // Lowered on both sides in SQL, as in `sameNameAs`.
        sql`lower(${findings.value}) = lower(${value})`,
      ))
      .limit(1)
    : finding.latest.filter((latest) => latest.label === label && latest.value.toLowerCase() === value.toLowerCase());
  if (repeated) {
    // The repeat wrote its column after all, say one the user cleared, so the
    // finding it repeats now counts as the agent's own.
    if (filled && !repeated.filled) {
      await tx
        .update(findings)
        .set({ filled: true })
        .where(and(eq(findings.id, repeated.id), eq(findings.workspaceId, workspaceId)));
    }
    return null;
  }

  const id = newId();
  await tx.insert(findings).values({
    id,
    workspaceId,
    leadId: finding.leadId,
    subjectType: subject,
    subjectId,
    label,
    value,
    sourceUrl: finding.sourceUrl,
    confidence: finding.confidence,
    traceId: finding.traceId,
    filled,
    // Not the column default, `now()`, which is the transaction's start: a
    // call that then waited for a lock would sort before a finding committed
    // while it waited, so the "latest" finding would disagree with the column,
    // in the fill rule and in the UI. Every lock is held by now, so the clock
    // gives the true order.
    createdAt: sql`clock_timestamp()`,
  });
  return id;
}

// Fills the already-locked subject's column under the fill rule, then records
// the finding, flagged with whether it wrote that column. The dedup and the
// agent's values both come from the findings as they were before this one.
async function applyFinding(
  tx: Tx,
  input: Omit<FindingRow, "subjectId" | "latest" | "filled"> & {
    readonly target: SubjectRow;
    readonly writer: AgentWrite;
    // The columns `linkCompany` wrote when it created the company.
    readonly linked: readonly string[];
  },
): Promise<{ findingId: string | null; filled: string[] }> {
  const { target, subject, label, value, writer } = input;
  const subjectId = target.row.id;
  const latest = await latestFindings(tx, input.workspaceId, subject, subjectId);
  const own = await latestFindings(tx, input.workspaceId, subject, subjectId, { filledOnly: true });
  const columns = findingColumns(subject, label, value);
  const filled = columns ? await fillSubject(tx, target, columns, agentColumnValues(subject, own), writer) : [];
  const named = namedColumn(subject, label);
  const wrote = named !== null && (filled.includes(named) || input.linked.includes(named));
  const findingId = await insertFinding(tx, { ...input, subjectId, latest, filled: wrote });
  return { findingId, filled };
}

async function fillSubject(
  tx: Tx,
  target: SubjectRow,
  columns: FindingColumns,
  agentValues: Partial<Record<string, unknown>>,
  writer: AgentWrite,
): Promise<string[]> {
  const { id, workspaceId } = target.row;
  if (target.table === "companies" && columns.table === "companies") {
    const patch = fillableCompanyColumns(target.row, columns.patch, agentValues);
    if (Object.keys(patch).length === 0) return [];
    await tx
      .update(companies)
      .set({ ...patch, ...writer })
      .where(and(eq(companies.id, id), eq(companies.workspaceId, workspaceId)));
    return Object.keys(patch);
  }
  if (target.table === "people" && columns.table === "people") {
    const patch = fillableColumns(target.row, columns.patch, agentValues);
    if (Object.keys(patch).length === 0) return [];
    await tx
      .update(people)
      .set({ ...patch, ...writer })
      .where(and(eq(people.id, id), eq(people.workspaceId, workspaceId)));
    return Object.keys(patch);
  }
  if (target.table === "leads" && columns.table === "leads") {
    const patch = fillableColumns(target.row, columns.patch, agentValues);
    if (Object.keys(patch).length === 0) return [];
    await tx
      .update(leads)
      .set({ ...patch, ...writer })
      .where(and(eq(leads.id, id), eq(leads.workspaceId, workspaceId)));
    return Object.keys(patch);
  }
  return [];
}

type ColleagueFields =
  | {
    readonly ok: true;
    readonly name: string;
    readonly title: string | null;
    readonly avatarUrl: string | null;
    readonly profileUrl: string | null;
  }
  | { readonly ok: false; readonly message: string };

// The same value rules as the person's own findings. Blank optional fields are
// simply absent.
function colleagueFields(input: ColleagueWrite): ColleagueFields {
  const name = normalizeFindingValue("person", "name", input.name);
  if (!name.ok) return name;
  const optional = (label: FindingLabel, raw: string | null) =>
    raw === null || raw.trim() === "" ? { ok: true as const, value: null } : normalizeFindingValue("person", label, raw);
  const title = optional("title", input.title);
  if (!title.ok) return title;
  const avatarUrl = optional("avatar_url", input.avatarUrl);
  if (!avatarUrl.ok) return avatarUrl;
  const profileUrl = optional("public_profiles", input.profileUrl);
  if (!profileUrl.ok) return profileUrl;
  return { ok: true, name: name.value, title: title.value, avatarUrl: avatarUrl.value, profileUrl: profileUrl.value };
}

// Companies

// Tries each dedup key in turn. The lock keeps a user edit from landing between
// the read and the gap fill.
async function findCompany(tx: Tx, workspaceId: string, fields: CompanyFields): Promise<Company | undefined> {
  for (const key of companyKeys(fields)) {
    // The name key is lowered in JS, so match on the name itself (`sameNameAs`).
    const match = key.by === "domain"
      ? eq(companies.domain, key.domain)
      : and(
        sameNameAs(companies.name, fields.name),
        key.withoutDomain ? isNull(companies.domain) : undefined,
      );
    const [company] = await tx
      .select()
      .from(companies)
      .where(and(eq(companies.workspaceId, workspaceId), match))
      .orderBy(companies.createdAt)
      .limit(1)
      .for("update");
    if (company) return company;
  }
  return undefined;
}

// The company's ID, and the columns this call wrote: every set field of a new
// row, or the gaps it filled in a found one.
interface ResolvedCompany {
  readonly id: string;
  readonly written: string[];
}

async function resolveCompany(
  tx: Tx,
  workspaceId: string,
  fields: CompanyFields | null,
  writer: AgentWrite,
): Promise<ResolvedCompany | null> {
  if (!fields) return null;
  // Giving a found company the domain, or inserting one with it, is a claim
  // on the domain like `claimDomain`'s.
  if (fields.domain) await lockDomain(tx, workspaceId, fields.domain);

  let company = await findCompany(tx, workspaceId, fields);
  if (!company) {
    const [inserted] = await tx
      .insert(companies)
      .values({ id: newId(), workspaceId, ...fields, ...writer })
      .onConflictDoNothing({ target: [companies.workspaceId, companies.domain] })
      .returning({ id: companies.id });
    if (inserted) {
      return { id: inserted.id, written: Object.keys(fields).filter((key) => fields[key as keyof CompanyFields] !== null) };
    }
    // A concurrent lead at the same company inserted it first.
    company = await findCompany(tx, workspaceId, fields);
    if (!company) return null;
  }

  const patch = missing(company, { domain: fields.domain, website: fields.website });
  if (Object.keys(patch).length > 0) {
    await tx
      .update(companies)
      .set({ ...patch, ...writer })
      .where(and(eq(companies.id, company.id), eq(companies.workspaceId, workspaceId)));
  }
  return { id: company.id, written: Object.keys(patch) };
}

// People

async function findPerson(
  tx: Tx,
  workspaceId: string,
  fields: PersonFields,
  companyId: string | null,
): Promise<Person | undefined> {
  const key = personKey(fields, companyId);
  if (!key) return undefined;
  // The name key is lowered in JS, so match on the name itself (`sameNameAs`).
  const match = key.by === "email"
    ? eq(people.email, key.email)
    : and(eq(people.companyId, key.companyId), sameNameAs(people.name, fields.name));

  const [person] = await tx
    .select()
    .from(people)
    .where(and(eq(people.workspaceId, workspaceId), match))
    .orderBy(people.createdAt)
    .limit(1)
    .for("update");
  return person;
}

async function resolvePerson(
  tx: Tx,
  workspaceId: string,
  fields: PersonFields | null,
  companyId: string | null,
  writer: AgentWrite,
): Promise<string | null> {
  if (!fields) return null;

  let person = await findPerson(tx, workspaceId, fields, companyId);
  if (!person) {
    const [inserted] = await tx
      .insert(people)
      .values({ id: newId(), workspaceId, companyId, ...fields, ...writer })
      .onConflictDoNothing({ target: [people.workspaceId, people.email] })
      .returning({ id: people.id });
    if (inserted) return inserted.id;
    // A concurrent lead for the same person inserted it first.
    person = await findPerson(tx, workspaceId, fields, companyId);
    if (!person) return null;
  }

  const patch = missing(person, { ...fields, companyId });
  if (Object.keys(patch).length > 0) {
    await tx
      .update(people)
      .set({ ...patch, ...writer })
      .where(and(eq(people.id, person.id), eq(people.workspaceId, workspaceId)));
  }
  return person.id;
}
