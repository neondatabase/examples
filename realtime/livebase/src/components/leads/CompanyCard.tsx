import { CalendarDays, Factory, Globe, Landmark, MapPin, Users } from "lucide-react";

import { CompanyLogo, companyLogoKey, Flash, Panel, Skeleton } from "~/components/ui";
import type { Company, Lead } from "~/db/schema";
import { MAX_LENGTHS } from "~/lib/constants";
import { normalizeDomain } from "~/lib/normalize";
import type { CompanyPatch } from "~/lib/types";
import { useLeadActions } from "~/realtime/actions";

import { EditableField, Fact, HostLink, parseInteger } from "./EditableField";
import { useLinkedWriter } from "./useLinkedWriter";

export interface CompanyCardProps {
  readonly lead: Lead;
  readonly company: Company | undefined;
}

// The lead's company. Its enrichment fields are always laid out, as faint
// placeholders until an agent fills them, so the card visibly fills in.
export function CompanyCard({ lead, company }: CompanyCardProps) {
  const { updateCompany } = useLeadActions();
  // Re-linking the lead to another company flashes as the lead's write.
  const writer = useLinkedWriter(company, lead.updatedBy);

  if (!company) {
    return (
      <Panel title="Company">
        {lead.status === "extracting" ? (
          <CompanySkeleton />
        ) : (
          <p className="py-1 text-[13px] text-fg-subtle">No company identified yet</p>
        )}
      </Panel>
    );
  }

  const save = (changes: CompanyPatch) => updateCompany(lead.id, company.id, changes);

  return (
    <Panel title="Company">
      <div className="@container flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {/* Flashes when the domain or a recorded logo brings an image. */}
          <Flash value={companyLogoKey(company)} writer={writer} as="div" className="shrink-0 rounded-lg">
            <CompanyLogo company={company} size="lg" />
          </Flash>
          <div className="min-w-0 flex-1">
            <EditableField
              label="Company name"
              value={company.name}
              placeholder="Company name"
              writer={writer}
              maxLength={MAX_LENGTHS.field}
              // The name is required, so clearing it keeps the old one.
              onSave={(name) => {
                if (name) save({ name });
              }}
              className="text-[15px] font-medium text-fg"
            />
            <EditableField
              label="Domain"
              value={company.domain}
              placeholder="Domain"
              mono
              writer={writer}
              maxLength={MAX_LENGTHS.field}
              validate={checkDomain}
              onSave={(domain) => save({ domain })}
              className="text-[12px] text-fg-muted"
            />
          </div>
        </div>
        <EditableField
          label="Description"
          value={company.description}
          placeholder="Description"
          multiline
          writer={writer}
          maxLength={MAX_LENGTHS.field}
          onSave={(description) => save({ description })}
          className="text-[13px] leading-relaxed text-fg-muted"
        />
        <div className="grid gap-x-4 gap-y-1 @2xs:grid-cols-2">
          <Fact icon={Factory}>
            <EditableField
              label="Industry"
              value={company.industry}
              placeholder="Industry"
              writer={writer}
              maxLength={MAX_LENGTHS.field}
              onSave={(industry) => save({ industry })}
            />
          </Fact>
          <Fact icon={Users}>
            <EditableField
              label="Size"
              value={company.sizeBand}
              placeholder="Size"
              writer={writer}
              maxLength={MAX_LENGTHS.field}
              onSave={(sizeBand) => save({ sizeBand })}
            />
          </Fact>
          <Fact icon={MapPin}>
            <EditableField
              label="Location"
              value={company.location}
              placeholder="Location"
              writer={writer}
              maxLength={MAX_LENGTHS.field}
              onSave={(location) => save({ location })}
            />
          </Fact>
          <Fact icon={CalendarDays}>
            <EditableField
              label="Founded"
              value={company.foundedYear}
              placeholder="Founded"
              numeric
              writer={writer}
              display={(year) => `Founded ${year}`}
              validate={checkYear}
              onSave={(year) => save({ foundedYear: parseInteger(year) })}
              className="tabular-nums"
            />
          </Fact>
          <Fact icon={Landmark}>
            <EditableField
              label="Funding"
              value={company.funding}
              placeholder="Funding"
              writer={writer}
              maxLength={MAX_LENGTHS.field}
              onSave={(funding) => save({ funding })}
            />
          </Fact>
          <Fact icon={Globe}>
            <EditableField
              label="Website"
              value={company.website}
              placeholder="Website"
              writer={writer}
              display={(url) => <HostLink url={String(url)} />}
              maxLength={MAX_LENGTHS.field}
              onSave={(website) => save({ website })}
            />
          </Fact>
        </div>
      </div>
    </Panel>
  );
}

// The server rejects the same drafts. Checking first keeps the editor open
// with a message instead of rolling the edit back.
function checkDomain(draft: string): string | null {
  return normalizeDomain(draft) ? null : "Enter a valid domain, such as acme.com";
}

function checkYear(draft: string): string | null {
  const year = parseInteger(draft);
  return year !== null && year >= 1000 && year <= 9999 ? null : "Enter a year, such as 2015";
}

function CompanySkeleton() {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">Identifying the company</span>
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-lg" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}
