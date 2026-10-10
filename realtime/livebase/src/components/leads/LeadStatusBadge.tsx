import { TriangleAlert } from "lucide-react";

import { Badge, Spinner, StatusDot } from "~/components/ui";
import type { Lead } from "~/db/schema";
import { STATUS_LABELS } from "~/lib/constants";
import type { RunStep } from "~/lib/types";

export interface LeadStatusBadgeProps {
  readonly lead: Lead;
  readonly currentStep?: RunStep;
}

// The lead's processing state at a glance. While enrichment runs, the badge
// names the agent's current step, so the list shows work as it happens.
export function LeadStatusBadge({ lead, currentStep }: LeadStatusBadgeProps) {
  switch (lead.status) {
    case "extracting":
      return (
        <Badge tone="neutral" icon={<Spinner size="xs" />} title="Reading the input">
          {STATUS_LABELS.extracting}
        </Badge>
      );
    case "enriching":
      return (
        <Badge
          tone="green"
          icon={<StatusDot tone="green" pulse />}
          title={currentStep ? `Enriching: ${currentStep.label}` : "Agents are researching this lead"}
          className="max-w-full"
        >
          <span className="min-w-0 truncate">
            {currentStep ? `${currentStep.label}…` : STATUS_LABELS.enriching}
          </span>
        </Badge>
      );
    case "ready":
      // A ready lead needs no badge.
      return null;
    case "failed":
      return (
        <Badge
          tone="red"
          icon={<TriangleAlert className="size-3" />}
          title={lead.statusDetail ?? "Processing failed"}
        >
          {STATUS_LABELS.failed}
          {/* The tooltip is out of reach for keyboard and screen reader users. */}
          {lead.statusDetail ? <span className="sr-only">: {lead.statusDetail}</span> : null}
        </Badge>
      );
  }
}
