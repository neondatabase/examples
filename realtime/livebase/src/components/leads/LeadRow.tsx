import { memo, useEffect, useId, useState, type ReactNode } from "react";
import { ChevronRight, Factory, MapPin, Users } from "lucide-react";

import { AgentActivity } from "~/components/activity/AgentActivity";
import { Avatar, Chip, CompanyLogo, Flash, RelativeTime, Skeleton, cn, companyLogoKey } from "~/components/ui";
import type { Company, Lead, LeadInput, Person, WriterKind } from "~/db/schema";
import { formatMoney, scorePercent, truncate } from "~/lib/format";
import type { RunStep } from "~/lib/types";

import { LeadActions } from "./LeadActions";
import { LeadDetails } from "./LeadDetails";
import { LeadStatusBadge } from "./LeadStatusBadge";
import { StageSelect } from "./StageSelect";
import { useLinkedWriter } from "./useLinkedWriter";

// One grid for the header and every row, so the columns line up. Narrow
// windows (the demo runs two side by side) drop Updated, then Company, then
// Person, and the lead cell's second line picks up their names.
export const LEAD_GRID_CLASS = cn(
  "grid items-center gap-3",
  "grid-cols-[minmax(0,1fr)_6.5rem_6.5rem]",
  "md:grid-cols-[minmax(0,1fr)_10rem_6.5rem_7rem]",
  "lg:grid-cols-[minmax(0,1fr)_11rem_9rem_6.5rem_7.5rem]",
  "xl:grid-cols-[minmax(0,1fr)_12rem_10rem_7rem_8rem_4.5rem]",
);

// The chevron, the gap, the logo, and the gap before the title: 20 + 10 + 32
// + 10 px. The header uses it to align "Lead" with the titles.
export const LEAD_TITLE_OFFSET_CLASS = "pl-[4.5rem]";

const COLLAPSE_MS = 200;

// The records come in as separate props, not one row object: each keeps its
// identity until it changes, so the memo skips rows that a write didn't touch.
export interface LeadRowProps {
  readonly lead: Lead;
  readonly person: Person | undefined;
  readonly company: Company | undefined;
  readonly input: LeadInput | undefined;
  readonly currentStep: RunStep | undefined;
  readonly expanded: boolean;
  readonly onToggle: (leadId: string) => void;
}

// The centrepiece of the demo. A new lead is a sparse, monochrome line:
// the raw input, placeholders, and a spinner. As extraction and enrichment
// write, the title, person, photo, company, logo, and fact chips arrive one by
// one, each flashing in the colour of whoever wrote it.
export const LeadRow = memo(function LeadRow({
  lead,
  person,
  company,
  input,
  currentStep,
  expanded,
  onToggle,
}: LeadRowProps) {
  const pending = lead.status === "extracting";
  const detailsId = useId();
  const personWriter = useLinkedWriter(person, lead.updatedBy);
  const companyWriter = useLinkedWriter(company, lead.updatedBy);

  function handleRowClick() {
    // Let people select text in a row without toggling it.
    if (window.getSelection()?.isCollapsed === false) return;
    onToggle(lead.id);
  }

  return (
    <li className="animate-enter border-b border-line last:border-b-0">
      <div
        onClick={handleRowClick}
        className={cn(
          LEAD_GRID_CLASS,
          "group/row relative min-h-11 cursor-pointer px-3 py-1.5 transition-colors duration-150 hover:bg-surface-2",
          expanded && "bg-surface-2/60",
          // Keyboard focus shows the actions too, so match their backdrop.
          "has-[:focus-visible]:bg-surface-2",
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${lead.title || "untitled lead"}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(lead.id);
            }}
            className="flex size-5 shrink-0 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
          >
            <ChevronRight
              aria-hidden
              className={cn("size-3.5 transition-transform duration-150", expanded && "rotate-90")}
            />
          </button>
          <LogoSlot company={company} writer={companyWriter} pending={pending} />
          <div className="min-w-0 flex-1 leading-4">
            <LeadTitle lead={lead} input={input} />
            <LeadFacts lead={lead} person={person} company={company} companyWriter={companyWriter} />
          </div>
        </div>

        <PersonCell person={person} writer={personWriter} pending={pending} />
        <CompanyCell company={company} writer={companyWriter} pending={pending} />

        <div className="flex min-w-0">
          <StageSelect lead={lead} size="xs" />
        </div>
        <div className="flex min-w-0">
          {/* Re-keyed so each status change eases in. */}
          <span key={lead.status} className="animate-enter flex min-w-0 max-w-full">
            <LeadStatusBadge lead={lead} currentStep={currentStep} />
          </span>
        </div>
        <div className="hidden text-right xl:block">
          <RelativeTime date={lastUpdated(lead, person, company)} className="text-xs tabular-nums text-fg-subtle" />
        </div>

        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center bg-linear-to-l from-surface-2 from-70% to-transparent pl-10 pr-3 opacity-0 transition-opacity duration-150 group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-has-[:focus-visible]/row:pointer-events-auto group-has-[:focus-visible]/row:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
          {/* Focus inside keeps an armed "Delete? Yes / No" visible after the pointer leaves. */}
          <LeadActions lead={lead} variant="row" />
        </div>
      </div>

      <Expansion id={detailsId} open={expanded}>
        <div className="grid gap-4 border-t border-line bg-bg/50 p-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <LeadDetails leadId={lead.id} variant="inline" />
          <AgentActivity leadId={lead.id} variant="inline" />
        </div>
      </Expansion>
    </li>
  );
});

// Flash only fires when a value changes after mount, so every slot that an
// agent fills stays mounted while empty and swaps its content in place.

interface CompanySlotProps {
  readonly company: Company | undefined;
  readonly writer: WriterKind | undefined;
  readonly pending: boolean;
}

// Flashes when the company is linked (its monogram arrives) and again when a
// domain or recorded logo brings an image.
function LogoSlot({ company, writer, pending }: CompanySlotProps) {
  return (
    <Flash
      as="div"
      value={companyLogoKey(company) ?? company?.id ?? null}
      writer={writer}
      className="flex size-8 shrink-0 items-center justify-center rounded-md"
    >
      {company ? (
        <CompanyLogo company={company} size="md" />
      ) : pending ? (
        <Skeleton className="block size-8 rounded-md" />
      ) : (
        <span aria-hidden className="size-8 rounded-md border border-dashed border-line-strong" />
      )}
    </Flash>
  );
}

function LeadTitle({ lead, input }: { readonly lead: Lead; readonly input: LeadInput | undefined }) {
  const preview = input ? truncate(input.rawText.replace(/\s+/g, " ").trim(), 160) : "";

  return (
    <Flash
      as="div"
      value={lead.title}
      writer={lead.updatedBy}
      className="relative truncate rounded-sm text-[13px] leading-5"
    >
      {lead.title ? (
        <span className="font-medium text-fg" title={lead.title}>
          {lead.title}
        </span>
      ) : (
        <>
          <span className="italic text-fg-muted" title={input?.rawText}>
            {preview || "Untitled lead"}
          </span>
          {/* Screen blending lets the sweep brighten the text without hiding it. */}
          {lead.status === "extracting" ? (
            <span aria-hidden className="shimmer pointer-events-none absolute inset-0 rounded-sm mix-blend-screen" />
          ) : null}
        </>
      )}
    </Flash>
  );
}

function LeadFacts({
  lead,
  person,
  company,
  companyWriter,
}: {
  readonly lead: Lead;
  readonly person: Person | undefined;
  readonly company: Company | undefined;
  readonly companyWriter: WriterKind | undefined;
}) {
  const value = formatMoney(lead.value);
  const personLabel = person?.name ?? person?.email ?? null;
  const hasFacts = Boolean(
    company?.industry || company?.sizeBand || company?.location || value || lead.fitScore != null,
  );

  // Without facts the line only carries names that narrow screens move out
  // of their hidden columns, so it hides at the width where those return.
  const visibility = hasFacts ? null : company ? "lg:hidden" : personLabel ? "md:hidden" : "hidden";

  return (
    <div
      className={cn(
        "mt-0.5 flex items-center gap-1.5 overflow-hidden [mask-image:linear-gradient(to_right,#000_85%,transparent)]",
        visibility,
      )}
    >
      {company ? <span className="shrink-0 text-xs text-fg-muted lg:hidden">{company.name}</span> : null}
      {personLabel ? <span className="shrink-0 text-xs text-fg-muted md:hidden">{personLabel}</span> : null}
      <FactChip
        label="Industry"
        value={company?.industry}
        writer={companyWriter}
        icon={<Factory className="size-3" />}
      />
      <FactChip
        label="Company size"
        value={company?.sizeBand}
        writer={companyWriter}
        icon={<Users className="size-3" />}
      />
      <FactChip
        label="Location"
        value={company?.location}
        writer={companyWriter}
        icon={<MapPin className="size-3" />}
      />
      <FactChip label="Deal value" value={value} writer={lead.updatedBy} />
      <span className={cn("shrink-0", lead.fitScore == null && "hidden")}>
        <Flash value={lead.fitScore} writer={lead.updatedBy} className="rounded-md">
          {lead.fitScore != null ? <FitScore score={lead.fitScore} /> : null}
        </Flash>
      </span>
    </div>
  );
}

interface FactChipProps {
  readonly label: string;
  readonly value: string | null | undefined;
  readonly writer: WriterKind | undefined;
  readonly icon?: ReactNode;
}

// The wrapper, not the Flash, hides an empty chip, so the line's gap doesn't
// leave holes.
function FactChip({ label, value, writer, icon }: FactChipProps) {
  return (
    <span className={cn("shrink-0", !value && "hidden")}>
      <Flash value={value ?? null} writer={writer} className="rounded-md">
        {value ? (
          <Chip icon={icon} title={`${label}: ${value}`} className="animate-enter">
            <span className="block max-w-40 truncate">{value}</span>
          </Chip>
        ) : null}
      </Flash>
    </span>
  );
}

function FitScore({ score }: { readonly score: number }) {
  const percent = scorePercent(score);

  return (
    <Chip title={`Fit score: ${percent} of 100`} className="animate-enter">
      <span className="inline-flex items-center gap-1.5">
        <span className="text-fg-subtle">Fit</span>
        <span aria-hidden className="relative h-1 w-8 overflow-hidden rounded-full bg-surface-3">
          <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${percent}%` }} />
        </span>
        <span className="tabular-nums">{percent}</span>
      </span>
    </Chip>
  );
}

interface PersonCellProps {
  readonly person: Person | undefined;
  readonly writer: WriterKind | undefined;
  readonly pending: boolean;
}

function PersonCell({ person, writer, pending }: PersonCellProps) {
  const label = person?.name ?? person?.email ?? null;

  return (
    <div className="hidden min-w-0 items-center gap-2 md:flex">
      {/* Flashes when enrichment records a photo. */}
      <Flash
        value={person?.avatarUrl ?? null}
        writer={writer}
        className="flex size-6 shrink-0 items-center justify-center rounded-full"
      >
        {person ? (
          <Avatar name={label} imageUrl={person.avatarUrl} size="sm" />
        ) : pending ? (
          <Skeleton className="block size-6 rounded-full" />
        ) : null}
      </Flash>
      <div className="min-w-0 flex-1 leading-4">
        <Flash as="div" value={label} writer={writer} className="truncate rounded-sm text-[13px] text-fg">
          {label ?? <EmptyValue pending={pending} />}
        </Flash>
        <Flash
          as="div"
          value={person?.title ?? null}
          writer={writer}
          className={cn("truncate rounded-sm text-xs text-fg-muted", !person?.title && "hidden")}
        >
          {person?.title}
        </Flash>
      </div>
    </div>
  );
}

function CompanyCell({ company, writer, pending }: CompanySlotProps) {
  return (
    <div className="hidden min-w-0 leading-4 lg:block">
      <Flash
        as="div"
        value={company?.name ?? null}
        writer={writer}
        className="truncate rounded-sm text-[13px] text-fg"
      >
        {company?.name ?? <EmptyValue pending={pending} />}
      </Flash>
      <Flash
        as="div"
        value={company?.domain ?? null}
        writer={writer}
        className={cn("truncate rounded-sm text-xs text-fg-subtle", !company?.domain && "hidden")}
      >
        {company?.domain}
      </Flash>
    </div>
  );
}

// While extraction runs, a missing value is still on its way, so it shows a
// skeleton rather than a dash.
function EmptyValue({ pending }: { readonly pending: boolean }) {
  return pending ? (
    <Skeleton className="block h-3 w-20 max-w-full rounded-sm" />
  ) : (
    <span className="text-fg-subtle">—</span>
  );
}

// Agents write the person and company rows as well as the lead, so the most
// recent of the three is when this lead last changed.
function lastUpdated(lead: Lead, person: Person | undefined, company: Company | undefined): Date {
  let latest = lead.updatedAt;
  for (const date of [person?.updatedAt, company?.updatedAt]) {
    if (date && date.getTime() > latest.getTime()) latest = date;
  }
  return latest;
}

interface ExpansionProps {
  readonly id: string;
  readonly open: boolean;
  readonly children: ReactNode;
}

// Animates height through a 0fr to 1fr grid row. The content stays mounted
// through the collapse, then unmounts, so collapsed rows hold no activity or
// message subscriptions.
function Expansion({ id, open, children }: ExpansionProps) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setMounted(false), COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <div
      id={id}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">{mounted ? children : null}</div>
    </div>
  );
}
