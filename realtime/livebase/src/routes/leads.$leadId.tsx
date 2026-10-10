import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, SearchX } from "lucide-react";

import { AgentActivity } from "~/components/activity/AgentActivity";
import { LeadDetails } from "~/components/leads/LeadDetails";
import { LeadHero } from "~/components/leads/LeadHero";
import { Skeleton } from "~/components/ui";
import { useLead } from "~/realtime/hooks";

// Lead IDs are UUIDs in canonical form, in either case.
const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// No loader: the root loader already seeded the workspace's collections, so
// this page renders on the server from them and then stays live.
export const Route = createFileRoute("/leads/$leadId")({
  // Anything but a UUID leaves the URL unmatched, so it 404s like any other
  // unknown page. (Throwing `notFound()` here would skip the root loader's
  // error handling.) Postgres matches UUIDs in either case but the live
  // queries compare strings, so the ID is lowercased like the rows.
  params: {
    parse: ({ leadId }) => (UUID_PATTERN.test(leadId) ? { leadId: leadId.toLowerCase() } : false),
  },
  head: () => ({ meta: [{ title: "Lead · Livebase" }] }),
  component: LeadPage,
});

function LeadPage() {
  const { leadId } = Route.useParams();
  const { row, isReady } = useLead(leadId);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-20">
      <Link
        to="/"
        className="inline-flex w-fit items-center gap-1.5 rounded-md text-[13px] text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        All leads
      </Link>
      {row ? (
        <>
          <LeadHero row={row} />
          <LeadDetails leadId={leadId} variant="page" />
          <AgentActivity leadId={leadId} variant="page" />
        </>
      ) : isReady ? (
        <MissingLead />
      ) : (
        <HeroSkeleton />
      )}
    </div>
  );
}

function MissingLead() {
  return (
    <div className="mt-16 flex flex-col items-center gap-3 text-center">
      <div className="grid size-10 place-items-center rounded-full bg-surface-2 text-fg-subtle">
        <SearchX aria-hidden className="size-5" />
      </div>
      <h1 className="text-[15px] font-medium text-fg">This lead doesn't exist or was deleted</h1>
      <Link to="/" className="text-[13px] text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline">
        Back to all leads
      </Link>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div role="status" className="flex items-start gap-5">
      <span className="sr-only">Loading lead</span>
      <Skeleton className="size-14 shrink-0 rounded-xl" />
      <div className="flex flex-1 flex-col gap-3 pt-1">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-6 w-1/2" />
      </div>
    </div>
  );
}
