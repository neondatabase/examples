import { useCallback, useState, type ReactNode } from "react";

import { Button, Skeleton, cn } from "~/components/ui";
import type { LeadFilters } from "~/lib/types";
import { useRunningStepByLead } from "~/realtime/activity";
import { useLeadRows } from "~/realtime/hooks";

import { EmptyState } from "./EmptyState";
import { LEAD_GRID_CLASS, LEAD_TITLE_OFFSET_CLASS, LeadRow } from "./LeadRow";

export interface LeadListProps {
  readonly filters: LeadFilters;
  // Whether the workspace has any leads, in either view.
  readonly hasLeads: boolean;
  readonly onFiltersChange: (changes: Partial<LeadFilters>) => void;
  readonly onCreated?: () => void;
}

const SKELETON_ROWS = 4;

// The dense, newest-first lead list. Rows expand in place.
export function LeadList({ filters, hasLeads, onFiltersChange, onCreated }: LeadListProps) {
  const { rows, isReady } = useLeadRows(filters);
  // One workspace-wide lookup, rather than an activity query per row.
  const runningSteps = useRunningStepByLead();
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((leadId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  }, []);

  if (rows.length === 0 && isReady && !hasLeads) {
    return <EmptyState onCreated={onCreated} />;
  }

  let body: ReactNode;
  if (rows.length > 0) {
    body = (
      <ul>
        {rows.map(({ lead, person, company, input }) => (
          <LeadRow
            key={lead.id}
            lead={lead}
            person={person}
            company={company}
            input={input}
            currentStep={runningSteps.get(lead.id)}
            expanded={expandedIds.has(lead.id)}
            onToggle={toggle}
          />
        ))}
      </ul>
    );
  } else if (!isReady) {
    body = <SkeletonRows />;
  } else {
    body = <NoMatches filters={filters} onFiltersChange={onFiltersChange} />;
  }

  return (
    <section aria-label="Leads" className="overflow-hidden rounded-lg border border-line bg-surface">
      <ListHeader />
      {body}
    </section>
  );
}

function ListHeader() {
  return (
    <div
      aria-hidden
      className={cn(
        LEAD_GRID_CLASS,
        "h-8 border-b border-line px-3 text-[11px] font-medium uppercase tracking-wider text-fg-subtle",
      )}
    >
      <span className={LEAD_TITLE_OFFSET_CLASS}>Lead</span>
      <span className="hidden md:block">Person</span>
      <span className="hidden lg:block">Company</span>
      <span>Stage</span>
      <span>Status</span>
      <span className="hidden text-right xl:block">Updated</span>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div role="status" aria-busy aria-label="Loading leads">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <div
          key={index}
          className={cn(LEAD_GRID_CLASS, "min-h-11 border-b border-line px-3 py-1.5 last:border-b-0")}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="size-5 shrink-0" />
            <Skeleton className="block size-8 shrink-0 rounded-md" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="block h-3 w-2/5 rounded-sm" />
              <Skeleton className="block h-2.5 w-1/4 rounded-sm" />
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Skeleton className="block size-6 shrink-0 rounded-full" />
            <Skeleton className="block h-3 w-20 rounded-sm" />
          </div>
          <div className="hidden lg:block">
            <Skeleton className="block h-3 w-16 rounded-sm" />
          </div>
          <Skeleton className="block h-5 w-16 rounded-md" />
          <Skeleton className="block h-5 w-14 rounded-md" />
          <div className="hidden xl:block">
            <Skeleton className="ml-auto block h-3 w-10 rounded-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface NoMatchesProps {
  readonly filters: LeadFilters;
  readonly onFiltersChange: (changes: Partial<LeadFilters>) => void;
}

// With a stage or search set, offer to clear them. Without one, the view
// itself is empty (every lead is archived, or none is), so offer the other.
function NoMatches({ filters, onFiltersChange }: NoMatchesProps) {
  let empty: { message: string; action: string; changes: Partial<LeadFilters> };
  if (filters.stage !== "all" || filters.search.trim() !== "") {
    empty = { message: "No leads match", action: "Clear filters", changes: { stage: "all", search: "" } };
  } else if (filters.view === "archived") {
    empty = { message: "No archived leads", action: "Show active", changes: { view: "active" } };
  } else {
    empty = { message: "No active leads", action: "Show archived", changes: { view: "archived" } };
  }

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-10 text-[13px] text-fg-muted">
      <span>{empty.message}</span>
      <Button variant="ghost" size="xs" onClick={() => onFiltersChange(empty.changes)}>
        {empty.action}
      </Button>
    </div>
  );
}
