import type { MouseEvent } from "react";

import { Flash, Select, type Size } from "~/components/ui";
import type { Lead, LeadStage } from "~/db/schema";
import { LEAD_STAGES, STAGE_LABELS, STAGE_TONES } from "~/lib/constants";
import { useLeadActions } from "~/realtime/actions";

export interface StageSelectProps {
  readonly lead: Lead;
  readonly size?: Size;
}

const STAGE_OPTIONS: readonly { value: LeadStage; label: string }[] = LEAD_STAGES.map((stage) => ({
  value: stage,
  label: STAGE_LABELS[stage],
}));

// Rows expand on click, so a click on the select stays with the select.
function stopPropagation(event: MouseEvent) {
  event.stopPropagation();
}

// Changing the stage is optimistic and doesn't restart enrichment.
// Extraction can set the stage too, so the select flashes with the lead's
// last writer.
export function StageSelect({ lead, size = "sm" }: StageSelectProps) {
  const { setStage } = useLeadActions();

  return (
    <Flash value={lead.stage} writer={lead.updatedBy} className="inline-flex max-w-full rounded-md">
      <span onClick={stopPropagation} className="inline-flex max-w-full">
        <Select
          aria-label={`Stage for ${lead.title || "untitled lead"}`}
          size={size}
          tone={STAGE_TONES[lead.stage]}
          value={lead.stage}
          options={STAGE_OPTIONS}
          onChange={(stage) => {
            if (stage !== lead.stage) setStage(lead.id, stage);
          }}
        />
      </span>
    </Flash>
  );
}
