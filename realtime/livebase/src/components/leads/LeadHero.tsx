import { Fragment } from "react";
import { Archive } from "lucide-react";

import { Avatar, Badge, cn, CompanyLogo, companyLogoKey, Flash, RelativeTime, Skeleton } from "~/components/ui";
import type { Company, Person, WriterKind } from "~/db/schema";
import { MAX_LENGTHS } from "~/lib/constants";
import { formatMoney, truncate } from "~/lib/format";
import type { LeadRowData } from "~/lib/types";
import { useLeadActions } from "~/realtime/actions";
import { useRunningStepByLead } from "~/realtime/activity";

import { EditableField } from "./EditableField";
import { LeadActions } from "./LeadActions";
import { LeadStatusBadge } from "./LeadStatusBadge";
import { StageSelect } from "./StageSelect";
import { useLinkedWriter } from "./useLinkedWriter";

// The top of the lead page. It starts as a monogram under the raw input, then
// fills in with the title, contact and their photo, logo, and value as agents
// write them.
// Highlights stay mounted while their value is empty: `Flash` fires on a
// change, so this makes a value's first arrival flash too.
export function LeadHero({ row }: { row: LeadRowData }) {
  const { lead, person, company, input } = row;
  const { updateLeadFields } = useLeadActions();
  const currentStep = useRunningStepByLead().get(lead.id);
  const value = formatMoney(lead.value);
  const extracting = lead.status === "extracting";
  // A newly linked person or company flashes as the lead's write.
  const personWriter = useLinkedWriter(person, lead.updatedBy);
  const companyWriter = useLinkedWriter(company, lead.updatedBy);

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
      <Flash value={companyLogoKey(company)} writer={companyWriter} as="div" className="w-fit shrink-0 rounded-xl">
        <CompanyLogo company={company} size="xl" />
      </Flash>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* The page's heading for screen readers. A role rather than <h1>, because
            the editable field renders block elements, which <h1> can't contain. */}
        <div role="heading" aria-level={1}>
          <EditableField
            label="Title"
            value={lead.title}
            // Until extraction names the lead, its raw input stands in for the title.
            placeholder={input ? truncate(input.rawText.replace(/\s+/g, " ").trim(), 90) : "Untitled lead"}
            wrap
            maxLength={MAX_LENGTHS.title}
            writer={lead.updatedBy}
            onSave={(title) => updateLeadFields(lead.id, { title: title ?? "" })}
            className={cn(
              "text-2xl font-semibold leading-tight tracking-tight text-fg",
              extracting && !lead.title && "shimmer",
            )}
          />
        </div>
        <HeroSubtitle
          person={person}
          company={company}
          personWriter={personWriter}
          companyWriter={companyWriter}
          pending={extracting}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
          <StageSelect lead={lead} size="sm" />
          <LeadStatusBadge lead={lead} currentStep={currentStep} />
          {lead.archived ? (
            <Badge tone="neutral" icon={<Archive aria-hidden className="size-3" />}>
              Archived
            </Badge>
          ) : null}
          <Flash
            value={lead.value}
            writer={lead.updatedBy}
            className={cn("rounded px-1 font-medium tabular-nums text-fg", !value && "hidden")}
          >
            {value}
          </Flash>
          <span className="text-fg-subtle">
            Created <RelativeTime date={lead.createdAt} />
          </span>
          <div className="ml-auto">
            <LeadActions lead={lead} variant="page" />
          </div>
        </div>
      </div>
    </header>
  );
}

interface Segment {
  readonly key: string;
  readonly text: string | null;
  readonly writer: WriterKind | undefined;
}

// "(photo) Jane Doe · VP Eng · Acme", each part flashing as it arrives. Every
// part keeps its slot, hidden while empty. The photo leads the person's part and
// shows whenever that part does, as a monogram until enrichment records one.
function HeroSubtitle({
  person,
  company,
  personWriter,
  companyWriter,
  pending,
}: {
  person: Person | undefined;
  company: Company | undefined;
  personWriter: WriterKind | undefined;
  companyWriter: WriterKind | undefined;
  pending: boolean;
}) {
  const personText = (person?.name ?? person?.email) || null;
  const segments: Segment[] = [
    { key: "person", text: personText, writer: personWriter },
    { key: "title", text: person?.title || null, writer: personWriter },
    { key: "company", text: company?.name || null, writer: companyWriter },
  ];
  const first = segments.findIndex((segment) => segment.text !== null);

  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[14px] text-fg-muted",
        first === -1 && !pending && "hidden",
      )}
    >
      {first === -1 && pending ? <Skeleton className="h-4 w-56" /> : null}
      <Flash
        value={person?.avatarUrl ?? null}
        writer={personWriter}
        className={cn("flex shrink-0 rounded-full", personText === null && "hidden")}
      >
        <Avatar name={personText} imageUrl={person?.avatarUrl} size="xs" />
      </Flash>
      {segments.map((segment, index) => (
        <Fragment key={segment.key}>
          {segment.text !== null && index > first ? (
            <span aria-hidden className="text-fg-subtle">
              ·
            </span>
          ) : null}
          <Flash
            value={segment.text}
            writer={segment.writer}
            className={cn("rounded px-0.5", segment.text === null && "hidden")}
          >
            {segment.text}
          </Flash>
        </Fragment>
      ))}
    </p>
  );
}
