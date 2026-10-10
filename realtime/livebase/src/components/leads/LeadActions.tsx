import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Archive, ArchiveRestore, ArrowUpRight, Trash2 } from "lucide-react";

import { Button, IconButton, type Size } from "~/components/ui";
import type { Lead } from "~/db/schema";
import { useLeadActions } from "~/realtime/actions";

export interface LeadActionsProps {
  readonly lead: Lead;
  readonly variant: "row" | "page";
}

// A stray click shouldn't leave the delete confirmation armed.
const CONFIRM_TIMEOUT_MS = 5000;

// Styled like an extra-small ghost IconButton, since a link can't be a button.
const ICON_LINK_CLASS = [
  "inline-flex size-6 items-center justify-center rounded-md text-fg-subtle transition-colors",
  "hover:bg-surface-3 hover:text-fg",
].join(" ");

// Open, archive, and delete. Delete asks inline ("Delete? Yes / No") rather
// than with a browser dialog, which would block the live updates behind it.
export function LeadActions({ lead, variant }: LeadActionsProps) {
  const { deleteLead, setArchived } = useLeadActions();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  // Closing the confirm unmounts its buttons. If one had focus, the Delete
  // trigger takes it, so a keyboard user doesn't drop back to <body>.
  const [refocusDelete, setRefocusDelete] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Row actions are announced out of context, so their names include the lead.
  const name = lead.title || "untitled lead";

  function closeConfirm() {
    setRefocusDelete(containerRef.current?.contains(document.activeElement) ?? false);
    setConfirming(false);
  }

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(closeConfirm, CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  const toggleArchived = () => setArchived(lead.id, !lead.archived);

  function confirmDelete() {
    closeConfirm();
    if (variant === "page") {
      // Leave first, so the page never renders this lead as missing.
      void navigate({ to: "/" }).finally(() => deleteLead(lead.id));
    } else {
      deleteLead(lead.id);
    }
  }

  const archiveIcon = lead.archived ? (
    <ArchiveRestore aria-hidden className="size-3.5" />
  ) : (
    <Archive aria-hidden className="size-3.5" />
  );

  if (variant === "row") {
    // The row toggles when clicked; its actions mustn't.
    return (
      <div
        ref={containerRef}
        className="flex items-center gap-0.5"
        onClick={stopPropagation}
        onKeyDown={stopPropagation}
      >
        {confirming ? (
          <DeleteConfirm prompt="Delete?" size="xs" onConfirm={confirmDelete} onCancel={closeConfirm} />
        ) : (
          <>
            <Link
              to="/leads/$leadId"
              params={{ leadId: lead.id }}
              aria-label={`Open ${name}`}
              title="Open lead page"
              className={ICON_LINK_CLASS}
            >
              <ArrowUpRight aria-hidden className="size-3.5" />
            </Link>
            <IconButton label={`${lead.archived ? "Unarchive" : "Archive"} ${name}`} size="xs" onClick={toggleArchived}>
              {archiveIcon}
            </IconButton>
            <IconButton
              label={`Delete ${name}`}
              size="xs"
              className="hover:text-danger"
              autoFocus={refocusDelete}
              onClick={() => setConfirming(true)}
            >
              <Trash2 aria-hidden className="size-3.5" />
            </IconButton>
          </>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex items-center gap-1.5">
      {confirming ? (
        <DeleteConfirm prompt="Delete this lead?" size="sm" onConfirm={confirmDelete} onCancel={closeConfirm} />
      ) : (
        <>
          <Button variant="secondary" size="sm" leadingIcon={archiveIcon} onClick={toggleArchived}>
            {lead.archived ? "Unarchive" : "Archive"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<Trash2 aria-hidden className="size-3.5" />}
            className="hover:text-danger"
            autoFocus={refocusDelete}
            onClick={() => setConfirming(true)}
          >
            Delete
          </Button>
        </>
      )}
    </div>
  );
}

interface DeleteConfirmProps {
  readonly prompt: string;
  readonly size: Size;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

function DeleteConfirm({ prompt, size, onConfirm, onCancel }: DeleteConfirmProps) {
  return (
    <div
      role="group"
      aria-label="Confirm delete"
      className="animate-enter flex items-center gap-1"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onCancel();
      }}
    >
      <span className="px-1 text-[12px] text-fg-muted">{prompt}</span>
      <Button variant="danger" size={size} onClick={onConfirm}>
        Yes
      </Button>
      {/* Focus lands on the safe choice. */}
      <Button variant="ghost" size={size} autoFocus onClick={onCancel}>
        No
      </Button>
    </div>
  );
}

function stopPropagation(event: SyntheticEvent) {
  event.stopPropagation();
}
