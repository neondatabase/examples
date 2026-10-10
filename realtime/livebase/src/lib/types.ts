import type { SealedLiveQuery } from "@neon/realtime/client";

import type {
  Company,
  Finding,
  Lead,
  LeadInput,
  LeadStage,
  Person,
  Workspace,
} from "~/db/schema";
import type { MastraSpan, MastraThread } from "~/db/mastra-schema";

export type Tone = "neutral" | "green" | "blue" | "yellow" | "orange" | "red" | "purple";

// `failed` is terminal: the connection has stopped reconnecting, so only a page
// reload brings live sync back. `stopped` is one subscription (the workspace
// probe) that the SDK ended; the other collections may still stream.
export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "offline" | "stopped" | "failed";

export interface LeadRef {
  readonly leadId: string;
  readonly workspaceId: string;
}

// Fields a user may change through the mutation server functions.
export type LeadPatch = Partial<Pick<Lead, "title" | "stage" | "value" | "summary" | "nextStep" | "archived">>;
export type PersonPatch = Partial<Pick<Person, "name" | "email" | "title" | "seniority" | "profileUrl">>;
export type CompanyPatch = Partial<Pick<
  Company,
  "name" | "domain" | "description" | "industry" | "sizeBand" | "location" | "website" | "foundedYear" | "funding"
>>;

// A span row as `spansQuery` syncs it: the declared columns plus the tool
// call's ID, which the query projects out of Mastra's `attributes` without
// syncing the rest. Null on spans that aren't tool calls. A tool step uses it
// to find its own call in the lead's messages (`attachToolDetails`).
// `load-workspace.ts` assigns `spansQuery`'s inferred query to
// `SealedWorkspaceQueries.spans`, so typecheck fails if the query stops
// projecting it.
export type SyncedSpan = MastraSpan & { readonly toolCallId: string | null };

export interface SealedWorkspaceQueries {
  readonly leads: SealedLiveQuery<Lead>;
  readonly people: SealedLiveQuery<Person>;
  readonly companies: SealedLiveQuery<Company>;
  readonly leadInputs: SealedLiveQuery<LeadInput>;
  readonly findings: SealedLiveQuery<Finding>;
  readonly threads: SealedLiveQuery<MastraThread>;
  readonly spans: SealedLiveQuery<SyncedSpan>;
  // A tiny query whose subscription state drives the connection indicator.
  readonly workspace: SealedLiveQuery<Workspace>;
}

export type LivebaseRow = Lead | Person | Company | LeadInput | Finding | MastraThread | SyncedSpan;

// `DbClient.dehydrate()` narrowed to the row shapes Livebase seeds, so that
// TanStack Start can prove the loader result is serializable.
export interface LivebaseDbState {
  readonly collections: readonly {
    readonly collectionId: string;
    readonly rows: readonly {
      readonly key: string;
      readonly value: LivebaseRow;
    }[];
  }[];
}

export interface WorkspaceData {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly sealedQueries: SealedWorkspaceQueries;
  readonly dbState: LivebaseDbState;
}

export interface LeadRowData {
  readonly lead: Lead;
  readonly person: Person | undefined;
  readonly company: Company | undefined;
  readonly input: LeadInput | undefined;
}

export type LeadView = "active" | "archived";

export interface LeadFilters {
  readonly stage: LeadStage | "all";
  readonly view: LeadView;
  readonly search: string;
}

export type RunStatus = "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type RunKind = "extraction" | "enrichment" | "other";
export type StepKind = "model" | "tool" | "workflow" | "agent" | "error" | "other";
// "stopped": cut off by a cancel or a server restart before it finished.
export type StepStatus = "running" | "completed" | "failed" | "stopped";

export interface RunStep {
  readonly id: string; // `${traceId}:${spanId}`
  readonly spanId: string;
  readonly kind: StepKind;
  readonly spanType: string;
  readonly label: string; // Human label, for example "webSearch" or "Model call"
  readonly depth: number; // 0 for the root's nearest visible descendants
  readonly status: StepStatus;
  readonly startedAt: Date | null;
  readonly endedAt: Date | null;
  readonly errorMessage: string | null;
  // Filled from the lead's messages when they are loaded (tool steps only).
  readonly toolName: string | null;
  readonly inputSummary: string | null;
  readonly resultSummary: string | null;
}

export interface Run {
  readonly traceId: string;
  readonly kind: RunKind;
  readonly label: string; // "Extraction", "Enrichment", or the entity name
  readonly status: RunStatus;
  readonly startedAt: Date | null;
  readonly endedAt: Date | null;
  readonly errorMessage: string | null;
  readonly steps: readonly RunStep[];
}

// What the runner hands to enrichment.
export interface EnrichmentContext {
  readonly leadId: string;
  readonly workspaceId: string;
  readonly signal: AbortSignal;
  readonly lead: Lead;
  readonly person: Person | null;
  readonly company: Company | null;
  readonly colleagues: readonly Person[];
  readonly rawText: string;
}
