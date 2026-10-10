import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

import { Input, SegmentedControl } from "~/components/ui";
import type { LeadStage } from "~/db/schema";
import { LEAD_STAGES, STAGE_LABELS } from "~/lib/constants";
import type { LeadFilters as LeadFilterState, LeadView } from "~/lib/types";

export interface LeadFiltersProps {
  readonly filters: LeadFilterState;
  readonly onChange: (changes: Partial<LeadFilterState>) => void;
}

const SEARCH_DEBOUNCE_MS = 200;

const STAGE_OPTIONS: readonly { value: LeadStage | "all"; label: string }[] = [
  { value: "all", label: "All" },
  ...LEAD_STAGES.map((stage) => ({ value: stage, label: STAGE_LABELS[stage] })),
];

const VIEW_OPTIONS: readonly { value: LeadView; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

// All filtering happens in the browser over live collections.
export function LeadFilters({ filters, onChange }: LeadFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchField value={filters.search} onCommit={(search) => onChange({ search })} />
      <SegmentedControl
        aria-label="Filter by stage"
        size="sm"
        value={filters.stage}
        options={STAGE_OPTIONS}
        onChange={(stage) => onChange({ stage })}
      />
      <div className="ml-auto">
        <SegmentedControl
          aria-label="Show active or archived leads"
          size="sm"
          value={filters.view}
          options={VIEW_OPTIONS}
          onChange={(view) => onChange({ view })}
        />
      </div>
    </div>
  );
}

interface SearchFieldProps {
  readonly value: string;
  readonly onCommit: (value: string) => void;
}

// Local state keeps typing instant; the URL follows after a short pause.
function SearchField({ value, onCommit }: SearchFieldProps) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  });

  // Adopt changes that come from elsewhere, such as "Clear filters".
  useEffect(() => {
    if (value === committed.current) return;
    committed.current = value;
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft === committed.current) return;
    const timer = setTimeout(() => {
      committed.current = draft;
      onCommitRef.current(draft);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  return (
    <div className="w-full sm:w-60">
      <Input
        type="search"
        aria-label="Search leads"
        placeholder="Search leads"
        leadingIcon={<Search className="size-3.5" />}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setDraft("");
        }}
      />
    </div>
  );
}
