import { cn, Field, Flash, Panel, Skeleton } from "~/components/ui";
import type { Lead } from "~/db/schema";
import { MAX_LENGTHS } from "~/lib/constants";
import { formatMoney } from "~/lib/format";
import type { LeadPatch } from "~/lib/types";
import { useLeadActions } from "~/realtime/actions";
import { useLead } from "~/realtime/hooks";

import { Colleagues } from "./Colleagues";
import { CompanyCard } from "./CompanyCard";
import { EditableField, parseInteger } from "./EditableField";
import { FindingsList, ScoreMeter } from "./FindingsList";
import { PersonCard } from "./PersonCard";
import { RawInput } from "./RawInput";

export interface LeadDetailsProps {
  readonly leadId: string;
  readonly variant: "inline" | "page";
}

// Everything known about a lead, editable in place. The expanded list row and
// the lead page share it; container queries fit the grid to the width each
// gives it, and the page variant only adds room.
export function LeadDetails({ leadId, variant }: LeadDetailsProps) {
  const { row, isReady } = useLead(leadId);
  const page = variant === "page";

  if (!row) return isReady ? null : <DetailsSkeleton />;
  const { lead, person, company, input } = row;

  return (
    <div className={cn("@container flex min-w-0 flex-col", page ? "gap-4" : "gap-3")}>
      {/* The page shows the title in its hero, so only the inline variant edits it here. */}
      <DealPanel lead={lead} showTitle={!page} />
      <div className={cn("grid @xl:grid-cols-2", page ? "gap-4" : "gap-3")}>
        <PersonCard lead={lead} person={person} />
        <CompanyCard lead={lead} company={company} />
      </div>
      {/* Keyed by subject, so switching to a different person or company
          doesn't animate the new subject's existing items in as fresh. */}
      {company ? <Colleagues key={company.id} companyId={company.id} personId={person?.id ?? null} /> : null}
      <FindingsList
        key={[lead.id, person?.id, company?.id].join(":")}
        leadId={lead.id}
        personId={person?.id ?? null}
        companyId={company?.id ?? null}
      />
      <RawInput input={input} />
    </div>
  );
}

type LeadFieldChanges = Omit<LeadPatch, "archived" | "stage">;

function DealPanel({ lead, showTitle }: { lead: Lead; showTitle: boolean }) {
  const { updateLeadFields } = useLeadActions();
  const save = (changes: LeadFieldChanges) => updateLeadFields(lead.id, changes);
  const writer = lead.updatedBy;

  return (
    <Panel title="Deal">
      <div className="@container">
        <div className="grid gap-x-6 gap-y-3 text-[13px] text-fg @md:grid-cols-2">
          {showTitle ? (
            <Field label="Title" className="@md:col-span-2">
              <EditableField
                label="Title"
                value={lead.title}
                placeholder="Untitled lead"
                wrap
                maxLength={MAX_LENGTHS.title}
                writer={writer}
                // The column is NOT NULL, so a cleared title is stored as "".
                onSave={(title) => save({ title: title ?? "" })}
                className="text-[14px] font-medium"
              />
            </Field>
          ) : null}
          <Field label="Value">
            <EditableField
              label="Value"
              value={lead.value}
              placeholder="Add a value"
              numeric
              writer={writer}
              display={(value) => formatMoney(Number(value)) ?? value}
              // Says why a draft can't be saved, rather than dropping it or letting the server roll it back.
              validate={(draft) =>
                parseInteger(draft) !== null ? null : "Enter an amount of 0 or more, like 50k"
              }
              onSave={(value) => save({ value: parseInteger(value) })}
              className="tabular-nums"
            />
          </Field>
          <Field label="Fit score">
            {/* Mounted while empty too, so the first score flashes when it arrives. */}
            <Flash value={lead.fitScore} writer={writer} as="div" className="-mx-1.5 w-fit rounded-md px-1.5 py-0.5">
              {lead.fitScore === null ? (
                <span className="text-fg-subtle">Not scored yet</span>
              ) : (
                <ScoreMeter value={lead.fitScore} label="Fit score" variant="wide" />
              )}
            </Flash>
          </Field>
          <Field label="Summary" className="@md:col-span-2">
            <EditableField
              label="Summary"
              value={lead.summary}
              placeholder="No summary yet"
              multiline
              maxLength={MAX_LENGTHS.summary}
              writer={writer}
              onSave={(summary) => save({ summary })}
              className="leading-relaxed"
            />
          </Field>
          <Field label="Next step" className="@md:col-span-2">
            <EditableField
              label="Next step"
              value={lead.nextStep}
              placeholder="No next step yet"
              wrap
              maxLength={MAX_LENGTHS.nextStep}
              writer={writer}
              onSave={(nextStep) => save({ nextStep })}
            />
          </Field>
        </div>
      </div>
    </Panel>
  );
}

function DetailsSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">Loading lead details</span>
      <Skeleton className="h-28 w-full rounded-lg" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}
