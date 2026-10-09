import { and, eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { findings, leadInputs, leads, type LeadStatus } from "~/db/schema";
import { LEAD_DATA_FIELDS, LEAD_STAGES, MAX_INPUT_LENGTH, MAX_LENGTHS, PROCESSING_STATUSES } from "~/lib/constants";
import { db, type Tx } from "~/server/db.server";
import { deleteLeadThread } from "~/server/mastra/mastra.server";
import { settleWithin } from "~/server/runner";
import { getRunner } from "~/server/runner.server";
import { transactionId } from "~/server/txid.server";
import { requireWorkspace } from "~/server/workspace.server";

import { parseWith, UserError, userErrors } from "./validation";

const createLeadSchema = z.object({
  leadId: z.uuid(),
  inputId: z.uuid(),
  rawText: z.string().trim().min(1).max(MAX_INPUT_LENGTH),
});

const updateLeadSchema = z.object({
  id: z.uuid(),
  changes: z.object({
    title: z.string().max(MAX_LENGTHS.title),
    stage: z.enum(LEAD_STAGES),
    // PostgreSQL `integer` stops at 2^31 - 1.
    value: z.number().int().min(0).max(2_147_483_647).nullable(),
    summary: z.string().max(MAX_LENGTHS.summary).nullable(),
    nextStep: z.string().max(MAX_LENGTHS.nextStep).nullable(),
    archived: z.boolean(),
  }).partial().strict().refine((changes) => Object.keys(changes).length > 0, "Nothing to update"),
});

const deleteLeadSchema = z.object({ id: z.uuid() });

const processingStatuses: readonly LeadStatus[] = PROCESSING_STATUSES;

// How long a delete waits for the lead's cancelled run to settle before it
// removes the Mastra thread. Tools honour the abort, so a run usually settles
// within milliseconds; this bounds the request when one doesn't.
const CANCEL_SETTLE_MS = 5_000;

// Archiving aborts the run, so a processing lead would otherwise show a
// spinner forever.
function cancelled(status: LeadStatus) {
  const statusDetail = status === "extracting" ? "Extraction cancelled" : "Enrichment cancelled";
  return { status: "ready", statusDetail } as const;
}

// Marks the row as last written by a user, which drives the highlight.
function userWrite() {
  return { updatedAt: new Date(), updatedBy: "user", updatedByTraceId: null } as const;
}

// Scope by workspace as well as ID, so a lead ID from another workspace
// matches nothing.
function leadInWorkspace(id: string, workspaceId: string) {
  return and(eq(leads.id, id), eq(leads.workspaceId, workspaceId));
}

// Only a landed extraction sets the input's kind, so a null kind means the lead
// was never extracted: extraction failed, was cancelled, or was interrupted.
async function awaitingExtraction(tx: Tx, leadId: string, workspaceId: string): Promise<boolean> {
  const [input] = await tx
    .select({ kind: leadInputs.kind })
    .from(leadInputs)
    .where(and(eq(leadInputs.leadId, leadId), eq(leadInputs.workspaceId, workspaceId)));
  return input !== undefined && input.kind === null;
}

export const createLead = createServerFn({ method: "POST" })
  .middleware([userErrors])
  .validator(parseWith(createLeadSchema))
  .handler(async ({ data: { leadId, inputId, rawText } }) => {
    const { workspaceId } = await requireWorkspace();
    // The startup sweep fails every processing lead, so a lead inserted before
    // it finishes would be failed with it.
    await getRunner().ready;
    const result = await db.transaction(async (tx) => {
      await tx.insert(leads).values({ id: leadId, workspaceId, updatedBy: "user" });
      await tx.insert(leadInputs).values({ id: inputId, workspaceId, leadId, rawText });
      return transactionId(tx);
    });
    // Start the agents only once the rows are committed, and don't wait for
    // them: the request returns while extraction runs in the background.
    getRunner().startLead({ leadId, workspaceId });
    return result;
  });

export const updateLead = createServerFn({ method: "POST" })
  .middleware([userErrors])
  .validator(parseWith(updateLeadSchema))
  .handler(async ({ data: { id, changes } }) => {
    const { workspaceId } = await requireWorkspace();
    const archiving = changes.archived === true;
    const editing = LEAD_DATA_FIELDS.some((field) => changes[field] !== undefined);
    const { result, reextract } = await db.transaction(async (tx) => {
      // Lock the row so the runner can't change its status between this read
      // and the write below.
      const [lead] = await tx
        .select({ status: leads.status, archived: leads.archived })
        .from(leads)
        .where(leadInWorkspace(id, workspaceId))
        .for("update");
      if (lead === undefined) throw new UserError("Lead not found");

      const cancelling = archiving && processingStatuses.includes(lead.status);
      // A lead that was never extracted has nothing to enrich, so editing its
      // data or restoring it from the archive runs extraction again. Setting
      // the status here shows the spinner at once, and lets a second failure
      // be recorded, since only a processing lead can fail.
      const restoring = changes.archived === false && lead.archived;
      const reextract = !(changes.archived ?? lead.archived)
        && (editing || restoring)
        && await awaitingExtraction(tx, id, workspaceId);
      await tx
        .update(leads)
        .set({
          ...changes,
          ...(cancelling ? cancelled(lead.status) : {}),
          ...(reextract ? { status: "extracting", statusDetail: null } as const : {}),
          ...userWrite(),
        })
        .where(leadInWorkspace(id, workspaceId));
      return { result: await transactionId(tx), reextract };
    });

    // Runner calls follow the commit, so a restarted run reads the new values.
    // Stage changes start nothing, and nor does restoring an extracted lead.
    const ref = { leadId: id, workspaceId };
    if (archiving) {
      void getRunner().cancel(id);
    } else if (reextract) {
      getRunner().restartEnrichment(ref, { fromExtraction: true });
    } else if (editing) {
      getRunner().restartEnrichment(ref);
    }
    return result;
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([userErrors])
  .validator(parseWith(deleteLeadSchema))
  .handler(async ({ data: { id } }) => {
    const { workspaceId } = await requireWorkspace();
    // Check ownership before cancelling, because the runner keys runs by lead
    // ID alone.
    const [lead] = await db.select({ id: leads.id }).from(leads).where(leadInWorkspace(id, workspaceId));
    if (lead === undefined) throw new UserError("Lead not found");
    // Abort first so the agent stops spending tokens. Any write it still makes
    // is dropped, because agent writes require the lead to exist.
    const stopped = getRunner().cancel(id);

    const result = await db.transaction(async (tx) => {
      // Inputs cascade. Findings about the person or company stay, with a null
      // lead_id, because other leads can share them. Findings about the lead
      // itself go with it.
      const deleted = await tx
        .delete(leads)
        .where(leadInWorkspace(id, workspaceId))
        .returning({ id: leads.id });
      if (deleted.length === 0) throw new UserError("Lead not found");
      await tx
        .delete(findings)
        .where(and(
          eq(findings.workspaceId, workspaceId),
          eq(findings.subjectType, "lead"),
          eq(findings.subjectId, id),
        ));
      return transactionId(tx);
    });

    // The lead is gone either way, so a leftover thread is logged, not
    // reported as a failed delete.
    const removeThread = async () => {
      try {
        await deleteLeadThread(id);
      } catch (error) {
        console.error(`Failed to delete the Mastra thread for lead ${id}`, error);
      }
    };
    // An aborted agent call still saves its last step once its in-flight tools
    // settle, and that save recreates the thread with the raw input. So the
    // thread goes only after the run has settled. A run that outlasts the wait
    // has its thread deleted again once it settles.
    const settled = await settleWithin(stopped, CANCEL_SETTLE_MS);
    await removeThread();
    if (!settled) void stopped.then(removeThread);
    return result;
  });
