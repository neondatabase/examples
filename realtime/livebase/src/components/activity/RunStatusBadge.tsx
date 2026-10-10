import { Ban, Check, TriangleAlert, Unplug } from "lucide-react";
import type { ReactNode } from "react";

import { Badge, Spinner } from "~/components/ui";
import type { RunStatus, Tone } from "~/lib/types";

interface StatusStyle {
  readonly tone: Tone;
  readonly label: string;
  readonly icon: ReactNode;
  readonly title?: string;
}

// Green stays reserved for live agent work; finished runs go quiet (neutral).
const STATUS_STYLES: Record<RunStatus, StatusStyle> = {
  running: { tone: "green", label: "Running", icon: <Spinner size="xs" /> },
  completed: { tone: "neutral", label: "Completed", icon: <Check aria-hidden className="size-3" /> },
  failed: { tone: "red", label: "Failed", icon: <TriangleAlert aria-hidden className="size-3" /> },
  cancelled: {
    tone: "orange",
    label: "Cancelled",
    icon: <Ban aria-hidden className="size-3" />,
    title: "Stopped because the lead was edited, archived, or deleted",
  },
  interrupted: {
    tone: "yellow",
    label: "Interrupted",
    icon: <Unplug aria-hidden className="size-3" />,
    title: "The server stopped before this run finished",
  },
};

export interface RunStatusBadgeProps {
  readonly status: RunStatus;
  readonly className?: string;
}

export function RunStatusBadge({ status, className }: RunStatusBadgeProps) {
  const style = STATUS_STYLES[status];
  return (
    <Badge tone={style.tone} icon={style.icon} title={style.title} className={className}>
      {style.label}
    </Badge>
  );
}
