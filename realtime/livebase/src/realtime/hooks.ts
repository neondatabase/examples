import type { InitialQueryBuilder } from "@tanstack/db";
import { eq, inArray, useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";

import type { Company, Finding, Lead, LeadInput, LeadStage, Person } from "~/db/schema";
import type { LeadFilters, LeadRowData, LeadView } from "~/lib/types";
import type { CollectionDescriptors } from "~/realtime/collections";
import { useRealtime } from "~/realtime/RealtimeProvider";

// Derived data is computed in the browser with live queries over the synced
// collections. Neon Realtime has no atomicity across queries, so a lead can
// arrive before its person or company and the reverse: every join is a left
// join, and either side may be missing for a moment.

interface LeadRecords {
  readonly lead: Lead;
  readonly person?: Person | undefined;
  readonly company?: Company | undefined;
  readonly input?: LeadInput | undefined;
}

const NO_PEOPLE: readonly Person[] = [];

// A lead joined to its person, company, and raw input. A lead has at most one
// input, so the joins give one row per lead.
function leadRecordsQuery(q: InitialQueryBuilder, descriptors: CollectionDescriptors) {
  return q
    .from({ lead: descriptors.leads })
    .join({ person: descriptors.people }, ({ lead, person }) => eq(lead.personId, person.id), "left")
    .join({ company: descriptors.companies }, ({ lead, company }) => eq(lead.companyId, company.id), "left")
    .join({ input: descriptors.leadInputs }, ({ lead, input }) => eq(input.leadId, lead.id), "left");
}

function toRowData({ lead, person, company, input }: LeadRecords): LeadRowData {
  return { lead, person, company, input };
}

// Newest first. Like `useLead`, this counts the SSR seed as ready: it holds
// the whole workspace, so the empty and missing states render on the server
// and before Neon Realtime's first reset, rather than a skeleton. The server and
// the hydrating client compute the same value.
export function useLeadRows(filters: LeadFilters): { rows: readonly LeadRowData[]; isReady: boolean } {
  const { descriptors, seeded } = useRealtime();
  const { view, stage, search } = filters;
  const { data, isReady } = useLiveQuery({
    query: (q) => {
      const inView = leadRecordsQuery(q, descriptors).where(({ lead }) => eq(lead.archived, view === "archived"));
      const inStage = stage === "all" ? inView : inView.where(({ lead }) => eq(lead.stage, stage));
      return inStage.orderBy(({ lead }) => lead.createdAt, "desc");
    },
  });

  // Search runs in memory over the joined rows, so it can match the person,
  // company, and raw input as well as the lead itself.
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const all = data.map(toRowData);
    return needle === "" ? all : all.filter((row) => searchableText(row).includes(needle));
  }, [data, search]);

  return { rows, isReady: isReady || seeded };
}

export function useLead(leadId: string): { row: LeadRowData | undefined; isReady: boolean } {
  const { descriptors, seeded } = useRealtime();
  const { data, isReady } = useLiveQuery({
    query: (q) => leadRecordsQuery(q, descriptors).where(({ lead }) => eq(lead.id, leadId)).findOne(),
  });
  const row = useMemo(() => (data ? toRowData(data) : undefined), [data]);
  return { row, isReady: isReady || seeded };
}

// Counted in the browser: live queries can't use GROUP BY on the server.
export function usePipelineCounts(view: LeadView = "active"): { total: number; byStage: Record<LeadStage, number> } {
  const { descriptors } = useRealtime();
  const { data } = useLiveQuery({
    query: (q) => q.from({ lead: descriptors.leads }).where(({ lead }) => eq(lead.archived, view === "archived")),
  });
  return useMemo(() => {
    const byStage: Record<LeadStage, number> = { new: 0, contacted: 0, qualified: 0, won: 0, lost: 0 };
    for (const lead of data) byStage[lead.stage] += 1;
    return { total: data.length, byStage };
  }, [data]);
}

// Other people at the same company, oldest first.
export function useColleagues(companyId: string | null, excludePersonId: string | null): readonly Person[] {
  const { descriptors } = useRealtime();
  // Without a company the query is disabled and `data` is undefined.
  const { data } = useLiveQuery({
    query: (q) => companyId === null
      ? undefined
      : q
        .from({ person: descriptors.people })
        .where(({ person }) => eq(person.companyId, companyId))
        .orderBy(({ person }) => person.createdAt, "asc"),
  });
  return useMemo(
    () => (data ? data.filter((person) => person.id !== excludePersonId) : NO_PEOPLE),
    [data, excludePersonId],
  );
}

// Findings about the lead, its person, and its company, newest first.
export function useFindings(subjects: {
  leadId: string;
  personId: string | null;
  companyId: string | null;
}): readonly Finding[] {
  const { descriptors } = useRealtime();
  const { leadId, personId, companyId } = subjects;
  const { data } = useLiveQuery({
    query: (q) => {
      // Matched by subject rather than `leadId`: people and companies are
      // shared, so their findings apply whichever lead's run produced them.
      // Subject IDs are UUIDs, unique across tables, so subjectType needn't match too.
      const subjectIds = [leadId, personId, companyId].filter((id): id is string => id !== null);
      return q
        .from({ finding: descriptors.findings })
        .where(({ finding }) => inArray(finding.subjectId, subjectIds))
        .orderBy(({ finding }) => finding.createdAt, "desc");
    },
  });
  return data;
}

function searchableText({ lead, person, company, input }: LeadRowData): string {
  return [
    lead.title,
    lead.summary,
    person?.name,
    person?.email,
    person?.title,
    company?.name,
    company?.domain,
    input?.rawText,
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
    .toLowerCase();
}
