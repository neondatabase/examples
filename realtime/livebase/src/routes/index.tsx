import { useCallback, useMemo } from "react";
import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";

import { LeadCapture } from "~/components/leads/LeadCapture";
import { LeadFilters } from "~/components/leads/LeadFilters";
import { LeadList } from "~/components/leads/LeadList";
import { PipelineSummary } from "~/components/leads/PipelineSummary";
import type { LeadStage } from "~/db/schema";
import { LEAD_STAGES } from "~/lib/constants";
import type { LeadFilters as LeadFilterState, LeadView } from "~/lib/types";
import { usePipelineCounts } from "~/realtime/hooks";

// The list filters live in the URL, so a filtered view survives a reload and
// can be shared. The root loader already hydrated the workspace, so this route
// needs no loader of its own.
interface HomeSearch {
  readonly stage: LeadStage | "all";
  readonly view: LeadView;
  readonly q: string;
}

// What links and navigations may pass. Every key is optional, so a plain
// `<Link to="/">` means "all active leads".
type HomeSearchInput = { stage?: LeadStage | "all"; view?: LeadView; q?: string };

const DEFAULT_FILTERS: LeadFilterState = { stage: "all", view: "active", search: "" };

export const Route = createFileRoute("/")({
  // The URL may hold anything, whatever the input type says.
  validateSearch: (search: HomeSearchInput & SearchSchemaInput) =>
    parseHomeSearch(search as Record<string, unknown>),
  component: HomePage,
});

// Unknown values fall back to the defaults instead of erroring, so a
// hand-edited URL still opens the list.
function parseHomeSearch(search: Record<string, unknown>): HomeSearch {
  const stage = LEAD_STAGES.find((value) => value === search.stage) ?? "all";
  const view: LeadView = search.view === "archived" ? "archived" : "active";
  // The default search parser reads values as JSON, so `?q=42` or `?q=true`
  // arrives as a number or a boolean.
  const q = ["string", "number", "boolean"].includes(typeof search.q) ? String(search.q) : "";
  return { stage, view, q };
}

// Defaults stay out of the URL.
function toSearchInput(filters: LeadFilterState): HomeSearchInput {
  const search: HomeSearchInput = {};
  if (filters.stage !== "all") search.stage = filters.stage;
  if (filters.view !== "active") search.view = filters.view;
  if (filters.search !== "") search.q = filters.search;
  return search;
}

function HomePage() {
  const { stage, view, q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const filters = useMemo<LeadFilterState>(() => ({ stage, view, search: q }), [stage, view, q]);

  // Both views are counted for `hasLeads`; the summary reuses the current one.
  const activeCounts = usePipelineCounts("active");
  const archivedCounts = usePipelineCounts("archived");
  const hasLeads = activeCounts.total + archivedCounts.total > 0;

  const setFilters = useCallback(
    (changes: Partial<LeadFilterState>) => {
      void navigate({
        to: "/",
        search: (previous) =>
          toSearchInput({ stage: previous.stage, view: previous.view, search: previous.q, ...changes }),
        // Filtering shouldn't add history entries or jump the page.
        replace: true,
        resetScroll: false,
      });
    },
    [navigate],
  );

  // A new lead is active, in the "new" stage, and untitled, so most filters
  // would hide it. Clear them so it appears at the top of the list.
  const revealNewLead = useCallback(() => {
    const hidden =
      filters.view !== "active" ||
      (filters.stage !== "all" && filters.stage !== "new") ||
      filters.search !== "";
    if (hidden) setFilters(DEFAULT_FILTERS);
  }, [filters, setFilters]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="sr-only">Leads</h1>
      {/* An empty workspace shows the samples in the empty state instead. */}
      <LeadCapture showSamples={hasLeads} onCreated={revealNewLead} />
      <div className="flex flex-col gap-3">
        <PipelineSummary
          filters={filters}
          counts={view === "archived" ? archivedCounts : activeCounts}
          onChange={setFilters}
        />
        <LeadFilters filters={filters} onChange={setFilters} />
        <LeadList
          filters={filters}
          hasLeads={hasLeads}
          onFiltersChange={setFilters}
          onCreated={revealNewLead}
        />
      </div>
    </div>
  );
}
