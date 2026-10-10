import type { ReactNode } from "react";

import { cn, toneDotClass } from "~/components/ui";
import type { LeadStage } from "~/db/schema";
import { LEAD_STAGES, STAGE_LABELS, STAGE_TONES } from "~/lib/constants";
import type { LeadFilters, Tone } from "~/lib/types";

export interface PipelineSummaryProps {
  readonly filters: LeadFilters;
  // The counts for `filters.view`, from `usePipelineCounts`.
  readonly counts: { readonly total: number; readonly byStage: Readonly<Record<LeadStage, number>> };
  readonly onChange: (changes: Partial<LeadFilters>) => void;
}

// Leads per stage, counted in the browser from the live leads collection.
// Each stage doubles as a one-click stage filter.
export function PipelineSummary({ filters, counts, onChange }: PipelineSummaryProps) {
  const { total, byStage } = counts;
  const allSelected = filters.stage === "all";

  function toggleStage(stage: LeadStage) {
    onChange({ stage: filters.stage === stage ? "all" : stage });
  }

  return (
    <div
      role="group"
      aria-label="Pipeline by stage"
      className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-6"
    >
      <SummaryCell
        label={filters.view === "archived" ? "Archived" : "All leads"}
        count={total}
        selected={allSelected}
        dimmed={false}
        onClick={() => onChange({ stage: "all" })}
        bar={
          // The whole pipeline as one stacked bar.
          <span className="flex h-1 gap-px overflow-hidden rounded-full bg-surface-3">
            {LEAD_STAGES.map((stage) =>
              byStage[stage] > 0 ? (
                <span
                  key={stage}
                  className={cn("h-full transition-[flex-grow] duration-500 ease-out", toneDotClass[STAGE_TONES[stage]])}
                  style={{ flexGrow: byStage[stage] }}
                />
              ) : null,
            )}
          </span>
        }
      />
      {LEAD_STAGES.map((stage) => {
        const count = byStage[stage];
        const selected = filters.stage === stage;
        // Keep a sliver visible for any stage that has leads.
        const percent = total > 0 && count > 0 ? Math.max(4, (count / total) * 100) : 0;
        return (
          <SummaryCell
            key={stage}
            label={STAGE_LABELS[stage]}
            tone={STAGE_TONES[stage]}
            count={count}
            selected={selected}
            dimmed={!allSelected && !selected}
            onClick={() => toggleStage(stage)}
            bar={
              <span className="block h-1 overflow-hidden rounded-full bg-surface-3">
                <span
                  className={cn(
                    "block h-full rounded-full transition-[width] duration-500 ease-out",
                    toneDotClass[STAGE_TONES[stage]],
                  )}
                  style={{ width: `${percent}%` }}
                />
              </span>
            }
          />
        );
      })}
    </div>
  );
}

interface SummaryCellProps {
  readonly label: string;
  readonly tone?: Tone;
  readonly count: number;
  readonly selected: boolean;
  readonly dimmed: boolean;
  readonly bar: ReactNode;
  readonly onClick: () => void;
}

function SummaryCell({ label, tone, count, selected, dimmed, bar, onClick }: SummaryCellProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-col gap-2 bg-surface px-3 pb-3 pt-2.5 text-left transition-[background-color,opacity] duration-150 hover:bg-surface-2 focus-visible:-outline-offset-2",
        selected && "bg-surface-2",
        dimmed && "opacity-50 hover:opacity-100",
      )}
    >
      <span className={cn("flex items-center gap-1.5 text-xs", selected ? "text-fg" : "text-fg-muted")}>
        {tone ? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", toneDotClass[tone])} /> : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="text-lg font-semibold leading-none tabular-nums text-fg">{count}</span>
      {bar}
    </button>
  );
}
