import { PROCESSING_STATUSES } from "~/lib/constants";
import type { LeadRef } from "~/lib/types";
import { enrichLead } from "~/server/mastra/enrichment.server";
import { extractLead } from "~/server/mastra/extraction-agent.server";

import { applyExtraction, loadEnrichmentSnapshot, loadLeadInput, setLeadStatus } from "./persist.server";
import type { JobContext } from "./runner";

// The steps of a lead's processing. The runner owns scheduling, cancellation,
// and error handling. These functions check the signal before each model call
// and each write, so an aborted job stops before it writes. A write
// already past its check still lands. For archive and delete that's safe,
// because each write's own condition skips an archived or missing lead. A
// restart after an edit relies on extraction only filling empty fields, and on
// the debounce letting the old job settle first.

// Runs extraction and persists it. Resolves true when enrichment should follow.
// Throws on model or database errors; the runner decides what that means.
export async function runExtraction(job: JobContext): Promise<boolean> {
  const input = await loadLeadInput(job);
  if (!input) return false;
  job.signal.throwIfAborted();
  const { extraction, traceId } = await extractLead({ ...job, rawText: input.rawText });
  job.signal.throwIfAborted();
  // The raw text goes along so only domains the input names are kept.
  return applyExtraction({ ...job, extraction, rawText: input.rawText, traceId });
}

// Enrichment works from a fresh snapshot, so a restart after an edit sees the
// user's corrected values.
export async function runEnrichment(job: JobContext): Promise<void> {
  const snapshot = await loadEnrichmentSnapshot(job);
  if (!snapshot) return;
  job.signal.throwIfAborted();
  // The lead was archived or deleted since the snapshot: nothing to enrich.
  if (!(await setLeadStatus({ ...job, status: "enriching", statusDetail: null }))) return;
  job.signal.throwIfAborted();
  await enrichLead({ ...snapshot, signal: job.signal });
  job.signal.throwIfAborted();
  await setLeadStatus({ ...job, status: "ready", onlyIf: ["enriching"] });
}

// Only a lead that is still processing can fail, so a late error never turns
// a ready lead into a failed one.
export async function markLeadFailed(ref: LeadRef, message: string): Promise<void> {
  await setLeadStatus({ ...ref, status: "failed", statusDetail: message, onlyIf: PROCESSING_STATUSES });
}
