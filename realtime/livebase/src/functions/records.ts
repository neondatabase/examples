import { and, DrizzleQueryError, eq, type SQL } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { DatabaseError } from "pg";
import { z } from "zod";

import { companies, leads, people } from "~/db/schema";
import { MAX_LENGTHS } from "~/lib/constants";
import { normalizeDomain, normalizeEmail } from "~/lib/normalize";
import { db, type Tx } from "~/server/db.server";
import { getRunner } from "~/server/runner.server";
import { transactionId } from "~/server/txid.server";
import { requireWorkspace } from "~/server/workspace.server";

import { parseWith, UserError, userErrors } from "./validation";

// A blank value clears the field. Anything else must normalize, so a typo is
// rejected, rolling back the optimistic edit, instead of being silently erased.
function normalizedText(normalize: (value: string) => string | null, message: string) {
  return z.string().max(MAX_LENGTHS.field).nullable().transform((value, ctx) => {
    if (value === null || value.trim() === "") return null;
    const normalized = normalize(value);
    if (normalized === null) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return normalized;
  });
}

const nullableText = z.string().max(MAX_LENGTHS.field).nullable();

const updatePersonSchema = z.object({
  leadId: z.uuid(),
  personId: z.uuid(),
  changes: z.object({
    name: nullableText,
    email: normalizedText(normalizeEmail, "Enter a valid email address"),
    title: nullableText,
    seniority: nullableText,
    profileUrl: nullableText,
  }).partial().strict().refine((changes) => Object.keys(changes).length > 0, "Nothing to update"),
});

const updateCompanySchema = z.object({
  leadId: z.uuid(),
  companyId: z.uuid(),
  changes: z.object({
    name: z.string().trim().min(1).max(MAX_LENGTHS.field),
    domain: normalizedText(normalizeDomain, "Enter a valid domain, such as acme.com"),
    description: nullableText,
    industry: nullableText,
    sizeBand: nullableText,
    location: nullableText,
    website: nullableText,
    foundedYear: z.number().int().min(1000).max(9999).nullable(),
    funding: nullableText,
  }).partial().strict().refine((changes) => Object.keys(changes).length > 0, "Nothing to update"),
});

// Marks the row as last written by a user, which drives the highlight.
function userWrite() {
  return { updatedAt: new Date(), updatedBy: "user", updatedByTraceId: null } as const;
}

// The lead must be in the workspace and point at the record being edited, so a
// mismatched pair can't restart an unrelated lead's enrichment.
async function assertLeadLinks(tx: Tx, leadId: string, workspaceId: string, link: SQL): Promise<void> {
  const [lead] = await tx
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId), link));
  if (lead === undefined) throw new UserError("Lead not found");
}

// A unique-key conflict on email or domain fails the update, which rolls back
// the optimistic edit. Drizzle's message holds the SQL and its parameters, so
// replace it with the reason before it reaches the browser. Any other error is
// left to `userErrors`.
function explainConflict(message: string) {
  return (error: unknown): never => {
    if (error instanceof DrizzleQueryError && error.cause instanceof DatabaseError && error.cause.code === "23505") {
      throw new UserError(message);
    }
    throw error;
  };
}

// People and companies are shared between leads, so the lead only says whose
// enrichment to restart.
export const updatePerson = createServerFn({ method: "POST" })
  .middleware([userErrors])
  .validator(parseWith(updatePersonSchema))
  .handler(async ({ data: { leadId, personId, changes } }) => {
    const { workspaceId } = await requireWorkspace();
    const result = await db.transaction(async (tx) => {
      await assertLeadLinks(tx, leadId, workspaceId, eq(leads.personId, personId));
      const updated = await tx
        .update(people)
        .set({ ...changes, ...userWrite() })
        .where(and(eq(people.id, personId), eq(people.workspaceId, workspaceId)))
        .returning({ id: people.id });
      if (updated.length === 0) throw new UserError("Person not found");
      return transactionId(tx);
    }).catch(explainConflict("Another person already has this email"));
    // After the commit, so the new run works from the corrected record. The
    // runner skips archived leads. Only extraction links a lead to a record, so
    // there's no extraction to rerun.
    getRunner().restartEnrichment({ leadId, workspaceId });
    return result;
  });

export const updateCompany = createServerFn({ method: "POST" })
  .middleware([userErrors])
  .validator(parseWith(updateCompanySchema))
  .handler(async ({ data: { leadId, companyId, changes } }) => {
    const { workspaceId } = await requireWorkspace();
    const result = await db.transaction(async (tx) => {
      await assertLeadLinks(tx, leadId, workspaceId, eq(leads.companyId, companyId));
      const updated = await tx
        .update(companies)
        .set({ ...changes, ...userWrite() })
        .where(and(eq(companies.id, companyId), eq(companies.workspaceId, workspaceId)))
        .returning({ id: companies.id });
      if (updated.length === 0) throw new UserError("Company not found");
      return transactionId(tx);
    }).catch(explainConflict("Another company already has this domain"));
    getRunner().restartEnrichment({ leadId, workspaceId });
    return result;
  });
