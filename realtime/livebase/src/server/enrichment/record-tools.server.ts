import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import type { SubjectType } from "~/db/schema";
import { FINDING_LABELS } from "~/lib/constants";
import { isFindingLabel } from "~/lib/finding-mapping";
import type { LeadRef } from "~/lib/types";
import { fitToBytes, toolTranscript, type RunBudget } from "~/server/enrichment/budget";
import { AVATAR_METHODS, avatarRank } from "~/server/enrichment/tools/people";
import type { ImageCheck } from "~/server/enrichment/web/image";
import { isOffLimits } from "~/server/enrichment/web/safe-fetch";
import type { ColleagueResult, ColleagueWrite, FindingResult, FindingWrite } from "~/server/persist.server";

// The enrichment agent's write tools, `recordFinding` and `recordColleague`.
// Each call writes as soon as the model reports a fact, with the run's trace ID
// and the fact's source page, through `persist.server.ts`, which makes every
// write conditional on the lead and applies the fill rule.
//
// LinkedIn and the other off-limits sites are never cited or linked. A source
// on one is dropped and the fact kept. A value on one, a profile, social link
// or image URL, is refused: the model can see such URLs in page data, bios and
// its own memory. The user's own LinkedIn URL needs no finding, because
// extraction already stored it as the person's profile link.
//
// Error policy. Expected refusals (a lead that's gone, an invalid or
// off-limits value, a failed image check, the colleague cap, a spent
// image-check budget) come back as `{ ok: false, error }` for the
// model. A database error must fail the lead, but Mastra turns a thrown tool
// error into a result the model reads and carries on. So a record tool
// hands the error to `onDatabaseError`, which keeps it and aborts the run, and
// then rethrows it; `enrichLead` throws the kept error once `generate`
// returns. Abort errors always propagate as they are.
//
// Each image check fetches a model-supplied URL of up to 2 MB, so it's charged
// to the run's image-check budget, kept apart from page reads.
//
// Persistence and the image check are injected, so the tools can be tested
// without a database or the network. They don't use `enrichmentTool`, which
// would swallow the database errors.

// The smallest image `recordFinding` accepts for each label. A colleague's
// photo needs the same as an avatar.
export const IMAGE_MIN_PX = { avatar: 64, logo: 32 } as const;

export interface RecordToolDeps {
  readonly persistFinding: (input: FindingWrite) => Promise<FindingResult>;
  readonly persistColleague: (input: ColleagueWrite) => Promise<ColleagueResult>;
  readonly checkImageUrl: (
    url: string,
    options: { readonly minPx: number; readonly signal?: AbortSignal },
  ) => Promise<ImageCheck>;
}

export interface RecordToolsRun extends LeadRef {
  readonly budget: RunBudget;
  // The lead's company when the run starts, so a write that links or re-points
  // it can say so (a `company.domain` may move the lead to an existing company).
  readonly companyId: string | null;
  // Keeps a database error and aborts the run. Called before the rethrow.
  readonly onDatabaseError: (error: Error) => void;
}

// Every label, for the input schema. Whether a label belongs to the subject is
// checked in `execute`, so a mismatch gets a message the model can act on.
const ALL_LABELS = [...new Set(Object.values(FINDING_LABELS).flat())] as [string, ...string[]];
const SUBJECTS = Object.keys(FINDING_LABELS) as [SubjectType, ...SubjectType[]];

// The labels whose value is a URL, which the UI links to or shows.
const URL_LABELS: ReadonlySet<string> = new Set([
  "company.logo_url",
  "company.social_links",
  "person.public_profiles",
  "person.avatar_url",
]);

const recordFindingInput = z.object({
  subject: z.enum(SUBJECTS).describe("Whose fact this is: the lead's company, the lead's person, or the lead itself."),
  label: z.enum(ALL_LABELS).describe('The finding label, such as "domain" or "title". See the value formats.'),
  value: z.string().min(1).describe("The value, in the label's format."),
  sourceUrl: z.string().optional().describe("The page that states the fact. Leave it out for facts from the input."),
  confidence: z.number().min(0).max(1).describe("How sure you are, from 0 to 1."),
  method: z
    .enum(AVATAR_METHODS)
    .optional()
    .describe("Required for person.avatar_url: the avatar step that found the image."),
});

const recordColleagueInput = z.object({
  name: z.string().min(2).describe("The colleague's full name, as the page gives it."),
  title: z.string().optional().describe("Their job title, as the page gives it."),
  photoUrl: z.string().optional().describe("A photo whose alt text, caption or JSON-LD names them."),
  profileUrl: z.string().optional().describe("Their profile or personal page."),
  sourceUrl: z.string().optional().describe("The team or leadership page that lists them."),
  confidence: z.number().min(0).max(1).describe("How sure you are, from 0 to 1."),
});

export function recordTools(run: RecordToolsRun, deps: RecordToolDeps) {
  const { budget, leadId, workspaceId } = run;
  // The best avatar method recorded so far in this run. It's set before
  // the write, synchronously, so of two avatar calls in one step the
  // worse-ranked one can't land last.
  let bestAvatarRank: number | null = null;
  let companyId = run.companyId;

  // Runs a record tool's body under the error policy above.
  async function guarded<T>(work: () => Promise<T>): Promise<T> {
    budget.signal.throwIfAborted();
    let result: T;
    try {
      result = await work();
    } catch (error) {
      if (budget.signal.aborted || isAbortError(error)) throw error;
      const failure = error instanceof Error ? error : new Error(String(error));
      run.onDatabaseError(failure);
      throw failure;
    }
    budget.signal.throwIfAborted();
    return fitToBytes(result, budget.limits.toolResultBytes) as T;
  }

  const recordFinding = createTool({
    id: "recordFinding",
    description: [
      "Record one fact about the lead's company, person or the lead itself, as soon as you have it.",
      "It's saved and shown to the user at once, and fills the matching field when that field is empty",
      "or was last filled by you. Image URLs (person.avatar_url, company.logo_url) are fetched and checked",
      "first, which counts against the run's image checks. person.avatar_url needs method.",
    ].join(" "),
    inputSchema: recordFindingInput,
    transform: toolTranscript(),
    execute: (input, context) =>
      guarded(async () => {
        const { subject, label, confidence, method } = input;
        if (!isFindingLabel(subject, label)) {
          return refuse(`"${label}" isn't a ${subject} label. Use one of: ${FINDING_LABELS[subject].join(", ")}.`);
        }
        let value = input.value.trim();
        if (URL_LABELS.has(`${subject}.${label}`) && isOffLimits(value)) {
          return refuse(offLimitsValue(`${subject}.${label} value`));
        }
        const isAvatar = subject === "person" && label === "avatar_url";
        const isLogo = subject === "company" && label === "logo_url";
        let rank: number | null = null;
        if (isAvatar) {
          if (!method) return refuse(`person.avatar_url needs method: one of ${AVATAR_METHODS.join(", ")}.`);
          rank = avatarRank(method);
          const better = worseThanRecorded(rank);
          if (better) return refuse(better);
        }
        if (isAvatar || isLogo) {
          // The check fetches a model-supplied URL, so it's charged to the
          // run's image checks. It's taken after the refusals above,
          // which fetch nothing, so they cost nothing.
          const spent = budget.take("image");
          if (spent) return refuse(`The image couldn't be checked, so nothing was recorded. ${spent}`);
          const check = await deps.checkImageUrl(value, {
            minPx: isAvatar ? IMAGE_MIN_PX.avatar : IMAGE_MIN_PX.logo,
            signal: budget.signal,
          });
          if (!check.ok) return refuse(`The image failed its check, so nothing was recorded: ${check.reason}`);
          // The final URL after redirects is the one the UI hot-links.
          value = check.url;
        }
        if (rank !== null) {
          // Another avatar call may have landed during the image check.
          const better = worseThanRecorded(rank);
          if (better) return refuse(better);
          bestAvatarRank = rank;
        }
        const result = await deps.persistFinding({
          leadId,
          workspaceId,
          traceId: traceIdOf(context),
          subject,
          label,
          value,
          sourceUrl: citableUrl(input.sourceUrl),
          confidence,
          signal: budget.signal,
        });
        if (!result.ok) return refuse(result.message);
        const relinked = result.companyId !== companyId;
        companyId = result.companyId;
        return {
          ok: true,
          recorded: result.findingId !== null,
          filled: result.filled,
          ...(result.findingId === null && { note: "Already the latest value, so nothing new was recorded." }),
          ...(relinked && result.companyId !== null && {
            company: "The lead is now linked to a company record. Record the company's other facts as usual.",
          }),
          ...((isAvatar || isLogo) && { url: value }),
        };
      }),
  });

  const recordColleague = createTool({
    id: "recordColleague",
    description: [
      "Add or update a colleague of the lead's person: someone the company's own team or leadership page",
      `lists. At most ${budget.limits.calls.colleague} per run. A photo is fetched and checked first, which counts`,
      "against the run's image checks, and dropped if it fails or the checks are spent; the colleague is still recorded.",
    ].join(" "),
    inputSchema: recordColleagueInput,
    transform: toolTranscript(),
    execute: (input, context) =>
      guarded(async () => {
        // Refused before the cap is charged, so the call can be made again.
        const photoUrl = input.photoUrl?.trim();
        const profileUrl = input.profileUrl?.trim() || null;
        if (profileUrl && isOffLimits(profileUrl)) return refuse(offLimitsValue("profileUrl", "recordColleague"));
        if (photoUrl && isOffLimits(photoUrl)) return refuse(offLimitsValue("photoUrl", "recordColleague"));
        // Synchronous, so concurrent calls in one step can't overrun the cap.
        const spent = budget.take("colleague");
        if (spent) return refuse(spent);
        let avatarUrl: string | null = null;
        let photoError: string | undefined;
        if (photoUrl) {
          // Charged as an image check, like recordFinding's. With the
          // checks spent the photo is dropped unchecked, as for a failed
          // check, and the colleague is still recorded.
          const imageSpent = budget.take("image");
          if (imageSpent) photoError = `Photo dropped, because it couldn't be checked: ${imageSpent}`;
          else {
            const check = await deps.checkImageUrl(photoUrl, { minPx: IMAGE_MIN_PX.avatar, signal: budget.signal });
            if (check.ok) avatarUrl = check.url;
            else photoError = `Photo dropped: ${check.reason}`;
          }
        }
        const result = await deps.persistColleague({
          leadId,
          workspaceId,
          traceId: traceIdOf(context),
          name: input.name,
          title: input.title?.trim() || null,
          avatarUrl,
          profileUrl,
          sourceUrl: citableUrl(input.sourceUrl),
          confidence: input.confidence,
          signal: budget.signal,
        });
        if (!result.ok) return refuse(result.message);
        return {
          ok: true,
          created: result.created,
          photo: avatarUrl !== null,
          ...(photoError !== undefined && { photoError }),
        };
      }),
  });

  // The reason a method can't replace this run's avatar, or null.
  function worseThanRecorded(rank: number): string | null {
    if (bestAvatarRank === null || rank <= bestAvatarRank) return null;
    return `This run already recorded an avatar by method "${AVATAR_METHODS[bestAvatarRank]}", which ranks above it. Keep that one.`;
  }

  return { recordFinding, recordColleague };
}

export type RecordTools = ReturnType<typeof recordTools>;

function refuse(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

// The refusal for an off-limits URL given as a value. With `retry`, the
// tool to call again without it.
function offLimitsValue(field: string, retry?: string): string {
  return (
    `The ${field} is on LinkedIn or another off-limits site, which is never cited or linked, so nothing was recorded. ` +
    (retry
      ? `Call ${retry} again without it.`
      : "Record only URLs on other sites. A LinkedIn URL from the user's input is already stored on the person.")
  );
}

// An off-limits source is dropped and the fact kept without one. Persist
// drops a source without an http(s) scheme, and `isOffLimits` is false for a
// value that isn't a URL, so only absolute URLs need the check. The same holds
// for the URL values above, which persist accepts only as absolute URLs.
function citableUrl(raw: string | undefined): string | null {
  const url = raw?.trim();
  if (!url) return null;
  return isOffLimits(url) ? null : url;
}

// The run's trace ID, from the tool's own span. Without tracing the
// span is missing or a no-op one, whose ID isn't real.
function traceIdOf(context: { tracingContext?: { currentSpan?: { isValid: boolean; traceId: string } } } | undefined): string | null {
  const span = context?.tracingContext?.currentSpan;
  return span?.isValid ? span.traceId : null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
