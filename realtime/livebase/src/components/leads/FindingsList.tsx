import { useMemo, useState } from "react";
import { ArrowUpRight, Briefcase, Building2, UserRound, type LucideIcon } from "lucide-react";

import { cn, Panel, RelativeTime } from "~/components/ui";
import type { Finding, SubjectType } from "~/db/schema";
import { scorePercent } from "~/lib/format";
import { compactUrl, findingDisplay, findingLabelName, visibleFindings } from "~/realtime/findings";
import { useFindings } from "~/realtime/hooks";

import { HostLink } from "./EditableField";

const SUBJECT_GROUPS: readonly { readonly type: SubjectType; readonly label: string; readonly icon: LucideIcon }[] = [
  { type: "company", label: "Company", icon: Building2 },
  { type: "person", label: "Person", icon: UserRound },
  { type: "lead", label: "Deal", icon: Briefcase },
];

export interface FindingsListProps {
  readonly leadId: string;
  readonly personId: string | null;
  readonly companyId: string | null;
}

// Enrichment facts with their provenance, grouped by what they describe: the
// latest value of each label, and every distinct value of the multi-valued ones
// (`visibleFindings`). A finding is the agent's own record, so it shows even
// where a user's edit or extraction kept the column.
export function FindingsList({ leadId, personId, companyId }: FindingsListProps) {
  const all = useFindings({ leadId, personId, companyId });
  const findings = useMemo(() => visibleFindings(all), [all]);
  // Findings that arrive after mount were just written by an agent, so they
  // animate in. Those already present when the details open don't.
  const [initialIds] = useState(() => new Set(all.map((finding) => finding.id)));

  return (
    <Panel
      title="Findings"
      actions={
        findings.length > 0 ? <span className="text-[12px] tabular-nums text-fg-subtle">{findings.length}</span> : null
      }
    >
      {findings.length === 0 ? (
        <p className="py-1 text-[13px] text-fg-subtle">Findings from enrichment will appear here.</p>
      ) : (
        <div className="@container flex flex-col gap-4">
          {SUBJECT_GROUPS.map(({ type, label, icon: Icon }) => {
            const items = findings.filter((finding) => finding.subjectType === type);
            if (items.length === 0) return null;
            return (
              <section key={type} aria-label={`${label} findings`}>
                <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                  <Icon aria-hidden className="size-3" />
                  {label}
                  <span className="tabular-nums">{items.length}</span>
                </h3>
                <ul className="divide-y divide-line">
                  {items.map((finding) => (
                    <FindingItem key={finding.id} finding={finding} fresh={!initialIds.has(finding.id)} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function FindingItem({ finding, fresh }: { finding: Finding; fresh: boolean }) {
  return (
    <li className={cn(fresh && "animate-enter")}>
      {/* The flash is on an inner element because both classes set `animation`. */}
      <div
        className={cn(
          "-mx-2 grid gap-x-4 gap-y-0.5 rounded-md px-2 py-2 @md:grid-cols-[9rem_minmax(0,1fr)]",
          fresh && "flash-agent",
        )}
      >
        <div
          className="truncate pt-px text-[12px] text-fg-muted"
          title={finding.traceId ? `From agent run ${finding.traceId}` : undefined}
        >
          {findingLabelName(finding.subjectType, finding.label)}
        </div>
        <div className="min-w-0">
          <FindingValue finding={finding} />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
            {finding.sourceUrl ? <HostLink url={finding.sourceUrl} /> : null}
            {finding.confidence !== null ? <ScoreMeter value={finding.confidence} label="Confidence" /> : null}
            <RelativeTime date={finding.createdAt} />
          </div>
        </div>
      </div>
    </li>
  );
}

function FindingValue({ finding }: { finding: Finding }) {
  const display = findingDisplay(finding);
  switch (display.kind) {
    case "image":
      return (
        <FindingImage
          url={display.url}
          shape={display.shape}
          alt={findingLabelName(finding.subjectType, finding.label)}
        />
      );
    case "score":
      // Stored from 0 to 1, like `leads.fit_score`.
      return <ScoreMeter value={display.value} label="Fit score" variant="wide" />;
    case "link":
      return <ValueLink href={display.href} text={display.text} />;
    case "text":
      return (
        <p className="line-clamp-3 break-words text-[13px] leading-snug text-fg" title={finding.value}>
          {display.text}
        </p>
      );
  }
}

// A small thumbnail of an avatar or logo the agent recorded, linking to the
// image. Hot-linked without a referrer, like `Avatar` and `CompanyLogo`.
// If the image doesn't load, its URL shows instead, so the finding is still
// readable.
function FindingImage({ url, shape, alt }: { url: string; shape: "round" | "square"; alt: string }) {
  // Remember which URL failed rather than a boolean, so a re-pointed finding
  // gets a fresh attempt.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const text = compactUrl(url) ?? url;
  if (failedUrl === url) return <ValueLink href={url} text={text} />;
  const fail = () => setFailedUrl(url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
      className="group inline-flex max-w-full items-center gap-2 focus-visible:-outline-offset-2"
    >
      <img
        // A fresh element per URL, so the checks below describe this request.
        key={url}
        src={url}
        alt={alt}
        width={32}
        height={32}
        decoding="async"
        referrerPolicy="no-referrer"
        draggable={false}
        onError={fail}
        ref={(node) => {
          // An SSR-rendered image can fail before React hydrates and attaches
          // `onError`, so judge that case on mount. A complete image with no
          // natural width either failed or is an SVG without intrinsic
          // dimensions, which `decode()` tells apart.
          if (node?.complete && node.naturalWidth === 0) node.decode().catch(fail);
        }}
        className={cn(
          "size-8 shrink-0 bg-surface-2 object-cover outline -outline-offset-1 outline-white/10",
          shape === "round" ? "rounded-full" : "rounded-md",
        )}
      />
      <span className="min-w-0 truncate text-[12px] text-fg-muted transition-colors group-hover:text-fg">{text}</span>
    </a>
  );
}

// Agents write these URLs from web pages, so they're untrusted:
// `findingDisplay` only passes http(s) ones.
function ValueLink({ href, text }: { href: string; text: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={href}
      className="inline-flex max-w-full items-center gap-0.5 text-[13px] text-fg underline-offset-2 hover:underline focus-visible:-outline-offset-2"
    >
      <span className="truncate">{text}</span>
      <ArrowUpRight aria-hidden className="size-3 shrink-0 opacity-70" />
    </a>
  );
}

export interface ScoreMeterProps {
  readonly value: number;
  readonly label: string;
  // "wide" is the prominent accent bar for a lead's fit score.
  readonly variant?: "compact" | "wide";
}

// Fit and confidence scores are on a 0–1 scale; the meter shows a percentage.
export function ScoreMeter({ value, label, variant = "compact" }: ScoreMeterProps) {
  const percent = scorePercent(value);
  const wide = variant === "wide";
  return (
    <span className="inline-flex items-center gap-2" title={`${label}: ${percent}%`}>
      <span
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className={cn("overflow-hidden rounded-full bg-surface-3", wide ? "h-1.5 w-28" : "h-1 w-10")}
      >
        <span
          className={cn("block h-full rounded-full transition-[width] duration-500", wide ? "bg-accent" : "bg-fg-muted")}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="tabular-nums">{percent}%</span>
    </span>
  );
}
