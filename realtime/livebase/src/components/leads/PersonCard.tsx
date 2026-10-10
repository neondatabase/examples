import { Award, Link2, Mail } from "lucide-react";

import { Avatar, Flash, Panel, Skeleton } from "~/components/ui";
import type { Lead, Person } from "~/db/schema";
import { MAX_LENGTHS } from "~/lib/constants";
import { normalizeEmail } from "~/lib/normalize";
import type { PersonPatch } from "~/lib/types";
import { useLeadActions } from "~/realtime/actions";

import { EditableField, Fact, HostLink } from "./EditableField";
import { useLinkedWriter } from "./useLinkedWriter";

export interface PersonCardProps {
  readonly lead: Lead;
  readonly person: Person | undefined;
}

// The lead's contact. Every field is editable, and an edit restarts the
// lead's enrichment with the corrected values.
export function PersonCard({ lead, person }: PersonCardProps) {
  const { updatePerson } = useLeadActions();
  // Re-linking the lead to another person flashes as the lead's write.
  const writer = useLinkedWriter(person, lead.updatedBy);

  if (!person) {
    return (
      <Panel title="Person">
        {lead.status === "extracting" ? (
          <PersonSkeleton />
        ) : (
          <p className="py-1 text-[13px] text-fg-subtle">No person identified yet</p>
        )}
      </Panel>
    );
  }

  const save = (changes: PersonPatch) => updatePerson(lead.id, person.id, changes);

  return (
    <Panel title="Person">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {/* The photo isn't editable: it's enrichment's find. It
              flashes on arrival like any other agent write. */}
          <Flash value={person.avatarUrl} writer={writer} as="div" className="flex shrink-0 rounded-full">
            <Avatar name={person.name ?? person.email} imageUrl={person.avatarUrl} size="lg" />
          </Flash>
          <div className="min-w-0 flex-1">
            <EditableField
              label="Name"
              value={person.name}
              placeholder="Name"
              writer={writer}
              maxLength={MAX_LENGTHS.field}
              onSave={(name) => save({ name })}
              className="text-[15px] font-medium text-fg"
            />
            <EditableField
              label="Title"
              value={person.title}
              placeholder="Title"
              writer={writer}
              maxLength={MAX_LENGTHS.field}
              onSave={(title) => save({ title })}
              className="text-[13px] text-fg-muted"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Fact icon={Award}>
            <EditableField
              label="Seniority"
              value={person.seniority}
              placeholder="Seniority"
              writer={writer}
              maxLength={MAX_LENGTHS.field}
              onSave={(seniority) => save({ seniority })}
            />
          </Fact>
          <Fact icon={Mail}>
            <EditableField
              label="Email"
              value={person.email}
              placeholder="Email"
              mono
              writer={writer}
              display={(email) => <MailLink email={String(email)} />}
              maxLength={MAX_LENGTHS.field}
              validate={checkEmail}
              onSave={(email) => save({ email })}
            />
          </Fact>
          <Fact icon={Link2}>
            <EditableField
              label="Profile"
              value={person.profileUrl}
              placeholder="Profile URL"
              writer={writer}
              display={(url) => <HostLink url={String(url)} />}
              maxLength={MAX_LENGTHS.field}
              onSave={(profileUrl) => save({ profileUrl })}
            />
          </Fact>
        </div>
      </div>
    </Panel>
  );
}

// The server rejects the same drafts. Checking first keeps the editor open
// with a message instead of rolling the edit back.
function checkEmail(draft: string): string | null {
  return normalizeEmail(draft) ? null : "Enter a valid email address";
}

function MailLink({ email }: { email: string }) {
  return (
    <a
      href={`mailto:${email}`}
      onClick={(event) => event.stopPropagation()}
      // Inset, because the field's truncating text clips an outer focus outline.
      className="text-fg-muted underline-offset-2 transition-colors hover:text-fg hover:underline focus-visible:-outline-offset-2"
    >
      {email}
    </a>
  );
}

function PersonSkeleton() {
  return (
    <div role="status" className="flex items-center gap-3">
      <span className="sr-only">Identifying the person</span>
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}
