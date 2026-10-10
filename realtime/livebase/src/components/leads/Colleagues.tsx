import { useState } from "react";

import { Avatar, cn, Flash, Panel } from "~/components/ui";
import { useColleagues } from "~/realtime/hooks";

export interface ColleaguesProps {
  readonly companyId: string;
  readonly personId: string | null;
}

// Other people known at the lead's company. Enrichment adds them as it finds
// them, with a photo when the team page has one that names them, and
// people are shared across leads, so this also shows earlier finds.
export function Colleagues({ companyId, personId }: ColleaguesProps) {
  const colleagues = useColleagues(companyId, personId);
  // People who arrive after mount are fresh enrichment results, so they animate in.
  const [initialIds] = useState(() => new Set(colleagues.map((person) => person.id)));

  if (colleagues.length === 0) return null;

  return (
    <Panel
      title="Colleagues"
      actions={<span className="text-[12px] tabular-nums text-fg-subtle">{colleagues.length}</span>}
    >
      <ul className="flex flex-wrap gap-2">
        {colleagues.map((person) => {
          const fresh = !initialIds.has(person.id);
          return (
            <li key={person.id} className={cn("min-w-0 max-w-full", fresh && "animate-enter")}>
              {/* The flash is on an inner element because both classes set `animation`. */}
              <div
                title={person.email ?? undefined}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-lg border border-line bg-surface-2 py-1.5 pl-1.5 pr-3",
                  fresh && "flash-agent",
                )}
              >
                {/* A photo found for a colleague already listed flashes too. */}
                <Flash value={person.avatarUrl} writer={person.updatedBy} className="flex shrink-0 rounded-full">
                  <Avatar name={person.name ?? person.email} imageUrl={person.avatarUrl} size="sm" />
                </Flash>
                <div className="min-w-0 max-w-56 leading-tight">
                  <div className="truncate text-[13px] text-fg">{person.name ?? person.email ?? "Unknown"}</div>
                  {person.title ? <div className="truncate text-[12px] text-fg-muted">{person.title}</div> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
