import { RotateCw } from "lucide-react";

import { Button, StatusDot, cn } from "~/components/ui";
import type { ConnectionStatus, Tone } from "~/lib/types";
import { useConnectionStatus } from "~/realtime/connection";

interface Presentation {
  readonly label: string;
  readonly tone: Tone;
  readonly pulse: boolean;
  readonly title: string;
  readonly className: string;
  readonly reloadable: boolean;
}

// Collections keep their last rows while the socket reconnects, so the non-live
// states say the data may be behind rather than gone. `failed` and `stopped`
// won't recover by themselves, so only they offer a reload.
const PRESENTATION: Record<ConnectionStatus, Presentation> = {
  live: {
    label: "Live",
    tone: "green",
    pulse: true,
    title: "Connected to Neon Realtime. Changes stream in from Postgres as they commit.",
    className: "border-accent/25 bg-accent/10 text-accent",
    reloadable: false,
  },
  connecting: {
    label: "Connecting…",
    tone: "neutral",
    pulse: false,
    title: "Opening a connection to Neon Realtime.",
    className: "border-line bg-surface text-fg-muted",
    reloadable: false,
  },
  reconnecting: {
    label: "Reconnecting…",
    tone: "yellow",
    pulse: true,
    title: "Connection lost. Showing the last synced data while Neon Realtime reconnects.",
    className: "border-warn/25 bg-warn/10 text-warn",
    reloadable: false,
  },
  offline: {
    label: "Offline",
    tone: "red",
    pulse: false,
    title: "You're offline. The data shown may be out of date until the connection returns.",
    className: "border-danger/25 bg-danger/10 text-danger",
    reloadable: false,
  },
  stopped: {
    label: "Sync stopped",
    tone: "neutral",
    pulse: false,
    title: "Live updates stopped for part of the workspace. Reload the page to resume them.",
    className: "border-line bg-surface text-fg-muted",
    reloadable: true,
  },
  failed: {
    label: "Disconnected",
    tone: "red",
    pulse: false,
    title: "Live sync stopped and won't resume on its own. Reload the page to reconnect.",
    className: "border-danger/25 bg-danger/10 text-danger",
    reloadable: true,
  },
};

export function ConnectionIndicator() {
  const status = useConnectionStatus();
  const { label, tone, pulse, title, className, reloadable } = PRESENTATION[status];
  const pill = (
    <span
      role="status"
      title={title}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs leading-none font-medium whitespace-nowrap select-none transition-colors duration-300",
        className,
      )}
    >
      <StatusDot tone={tone} pulse={pulse} />
      {label}
    </span>
  );
  if (!reloadable) return pill;
  return (
    <span className="inline-flex items-center gap-2">
      {pill}
      <Button
        size="xs"
        title={title}
        leadingIcon={<RotateCw aria-hidden className="size-3" />}
        onClick={() => window.location.reload()}
      >
        Reload
      </Button>
    </span>
  );
}
