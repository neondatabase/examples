import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Badge, Button, cn, Panel, RelativeTime } from "~/components/ui";
import type { InputKind, LeadInput } from "~/db/schema";

const KIND_LABELS: Record<InputKind, string> = {
  email: "Email",
  profile_url: "Profile URL",
  website: "Website",
  name: "Name",
  notes: "Notes",
  mixed: "Mixed",
};

// Long inputs start collapsed so the rest of the details stay scannable.
const COLLAPSE_AFTER_CHARS = 320;
const COLLAPSE_AFTER_LINES = 6;

// What the user pasted, exactly as it was captured.
export function RawInput({ input }: { input: LeadInput | undefined }) {
  const [expanded, setExpanded] = useState(false);
  if (!input) return null;

  const long =
    input.rawText.length > COLLAPSE_AFTER_CHARS || input.rawText.split("\n").length > COLLAPSE_AFTER_LINES;
  const collapsed = long && !expanded;

  return (
    <Panel title="Raw input" actions={input.kind ? <Badge tone="neutral">{KIND_LABELS[input.kind]}</Badge> : null}>
      <pre
        className={cn(
          "whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-fg-muted",
          // A mask fades the cut-off text without knowing the panel's colour.
          collapsed && "max-h-32 overflow-hidden [mask-image:linear-gradient(to_bottom,black_50%,transparent)]",
        )}
      >
        {input.rawText}
      </pre>
      <div className="mt-2 flex min-h-6 items-center justify-between gap-2 text-[11px] text-fg-subtle">
        <span>
          Captured <RelativeTime date={input.createdAt} />
        </span>
        {long ? (
          <Button
            variant="ghost"
            size="xs"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
            leadingIcon={
              <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
            }
          >
            {expanded ? "Show less" : "Show all"}
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}
