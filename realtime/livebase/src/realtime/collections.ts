import { BasicIndex, collectionOptions } from "@tanstack/react-db";
import { realtimeCollectionOptions } from "@neon/realtime-tanstack";
import type { SealedLiveQuery, RealtimeClient } from "@neon/realtime/client";

import type { MastraSpan, MastraThread } from "~/db/mastra-schema";
import type { Company, Finding, Lead, LeadInput, Person } from "~/db/schema";
import {
  sealCompanies,
  sealFindings,
  sealLeadInputs,
  sealLeads,
  sealPeople,
  sealSpans,
  sealThreads,
} from "~/functions/seal";
import { deleteLead, updateLead } from "~/functions/leads";
import type { LeadPatch, SyncedSpan, SealedWorkspaceQueries } from "~/lib/types";
import { isNotConfirmedError, WRITE_NOT_CONFIRMED } from "~/lib/write-confirmation";

// Stable IDs let the browser's collections adopt the rows that the server
// seeded into its request-scoped DbClient.
export const COLLECTION_IDS = {
  leads: "livebase-leads",
  people: "livebase-people",
  companies: "livebase-companies",
  leadInputs: "livebase-lead-inputs",
  findings: "livebase-findings",
  threads: "livebase-mastra-threads",
  spans: "livebase-mastra-spans",
} as const;

// The fields `updateLead` accepts. Drafts also stamp `updatedAt` and the
// last-writer columns, but the server sets those itself.
const LEAD_PATCH_KEYS = [
  "title",
  "stage",
  "value",
  "summary",
  "nextStep",
  "archived",
] as const satisfies readonly (keyof LeadPatch)[];

// Joined collections need an index on the join key. TanStack DB auto-creates one
// with `autoIndex: "eager"`; without it each join scans the collection, and dev
// builds warn when that gets slow.
const JOIN_INDEXES = { autoIndex: "eager", defaultIndexType: BasicIndex } as const;

// Without a timeout, a stalled sync never settles `awaitTxId`, so the optimistic
// row stays on screen and never rolls back. At 10 s the row rolls back, and it
// comes back when the sync delivers the committed row.
const CONFIRM_TIMEOUT_MS = 10_000;

// Waits until the sync delivers a committed write. A sync that doesn't confirm
// in time rejects with `WRITE_NOT_CONFIRMED`, which says the write was saved.
export async function confirmWrite(
  collection: { utils: { awaitTxId(txid: string, timeout?: number): Promise<boolean> } },
  txid: string,
): Promise<void> {
  try {
    await collection.utils.awaitTxId(txid, CONFIRM_TIMEOUT_MS);
  } catch (error) {
    if (isNotConfirmedError(error)) throw new Error(WRITE_NOT_CONFIRMED, { cause: error });
    throw error;
  }
}

// Mastra spans have a composite primary key.
export function spanKey(span: Pick<MastraSpan, "traceId" | "spanId">): string {
  return `${span.traceId}:${span.spanId}`;
}

// Leads are the only collection with mutation handlers. Inserts go through the
// `createLead` optimistic action instead, because a new lead and its raw input
// are written together.
function createLeadsCollection(
  client: RealtimeClient,
  query: SealedLiveQuery<Lead>,
) {
  return collectionOptions(realtimeCollectionOptions({
    id: COLLECTION_IDS.leads,
    client,
    query,
    refreshQuery: () => sealLeads(),
    getKey: (lead) => lead.id,
    onUpdate: async ({ transaction, collection }) => {
      const { original, changes } = transaction.mutations[0];
      const patch = pick(changes, LEAD_PATCH_KEYS);
      if (Object.keys(patch).length === 0) return;
      const result = await updateLead({ data: { id: original.id, changes: patch } });
      await confirmWrite(collection, result.txid);
    },
    onDelete: async ({ transaction, collection }) => {
      const result = await deleteLead({ data: { id: transaction.mutations[0].original.id } });
      await confirmWrite(collection, result.txid);
    },
  }));
}

// People and companies change only through optimistic actions in `actions.ts`,
// so they need no handlers of their own.
function createPeopleCollection(
  client: RealtimeClient,
  query: SealedLiveQuery<Person>,
) {
  return collectionOptions(realtimeCollectionOptions({
    id: COLLECTION_IDS.people,
    client,
    query,
    ...JOIN_INDEXES,
    refreshQuery: () => sealPeople(),
    getKey: (person) => person.id,
  }));
}

function createCompaniesCollection(
  client: RealtimeClient,
  query: SealedLiveQuery<Company>,
) {
  return collectionOptions(realtimeCollectionOptions({
    id: COLLECTION_IDS.companies,
    client,
    query,
    ...JOIN_INDEXES,
    refreshQuery: () => sealCompanies(),
    getKey: (company) => company.id,
  }));
}

function createLeadInputsCollection(
  client: RealtimeClient,
  query: SealedLiveQuery<LeadInput>,
) {
  return collectionOptions(realtimeCollectionOptions({
    id: COLLECTION_IDS.leadInputs,
    client,
    query,
    ...JOIN_INDEXES,
    refreshQuery: () => sealLeadInputs(),
    getKey: (input) => input.id,
  }));
}

// Findings and the Mastra tables are written only by the agents: read-only here.
function createFindingsCollection(
  client: RealtimeClient,
  query: SealedLiveQuery<Finding>,
) {
  return collectionOptions(realtimeCollectionOptions({
    id: COLLECTION_IDS.findings,
    client,
    query,
    refreshQuery: () => sealFindings(),
    getKey: (finding) => finding.id,
  }));
}

function createThreadsCollection(
  client: RealtimeClient,
  query: SealedLiveQuery<MastraThread>,
) {
  return collectionOptions(realtimeCollectionOptions({
    id: COLLECTION_IDS.threads,
    client,
    query,
    refreshQuery: () => sealThreads(),
    getKey: (thread) => thread.id,
  }));
}

// Typed with the tool call ID that `spansQuery` projects.
function createSpansCollection(
  client: RealtimeClient,
  query: SealedLiveQuery<SyncedSpan>,
) {
  return collectionOptions(realtimeCollectionOptions({
    id: COLLECTION_IDS.spans,
    client,
    query,
    refreshQuery: () => sealSpans(),
    getKey: (span) => spanKey(span),
  }));
}

export type CollectionDescriptors = {
  readonly leads: ReturnType<typeof createLeadsCollection>;
  readonly people: ReturnType<typeof createPeopleCollection>;
  readonly companies: ReturnType<typeof createCompaniesCollection>;
  readonly leadInputs: ReturnType<typeof createLeadInputsCollection>;
  readonly findings: ReturnType<typeof createFindingsCollection>;
  readonly threads: ReturnType<typeof createThreadsCollection>;
  readonly spans: ReturnType<typeof createSpansCollection>;
};

// Descriptors are plain options: the server resolves them in a request-scoped
// DbClient to seed SSR rows, and the browser resolves them in the router's.
export function createCollectionDescriptors(
  client: RealtimeClient,
  sealedQueries: SealedWorkspaceQueries,
): CollectionDescriptors {
  return {
    leads: createLeadsCollection(client, sealedQueries.leads),
    people: createPeopleCollection(client, sealedQueries.people),
    companies: createCompaniesCollection(client, sealedQueries.companies),
    leadInputs: createLeadInputsCollection(client, sealedQueries.leadInputs),
    findings: createFindingsCollection(client, sealedQueries.findings),
    threads: createThreadsCollection(client, sealedQueries.threads),
    spans: createSpansCollection(client, sealedQueries.spans),
  };
}

function pick<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in source) result[key] = source[key];
  }
  return result;
}
