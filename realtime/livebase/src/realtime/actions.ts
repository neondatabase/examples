import { useMemo } from "react";
import { createOptimisticAction } from "@tanstack/react-db";
import type { Transaction } from "@tanstack/db";

import { showWriteError } from "~/components/write-errors";
import type { Lead, LeadInput, LeadStage } from "~/db/schema";
import { createLead as createLeadOnServer } from "~/functions/leads";
import {
  updateCompany as updateCompanyOnServer,
  updatePerson as updatePersonOnServer,
} from "~/functions/records";
import { newId } from "~/lib/ids";
import type { CompanyPatch, LeadPatch, PersonPatch } from "~/lib/types";
import { useRealtime, type LivebaseCollections } from "~/realtime/RealtimeProvider";

// The only way UI code mutates data. Every write is optimistic and confirmed
// with the transaction ID its server function returns.
export interface LeadActions {
  createLead(rawText: string): string; // returns the new lead ID
  setStage(leadId: string, stage: LeadStage): void;
  updateLeadFields(leadId: string, changes: Omit<LeadPatch, "archived" | "stage">): void;
  setArchived(leadId: string, archived: boolean): void;
  deleteLead(leadId: string): void;
  updatePerson(leadId: string, personId: string, changes: PersonPatch): void;
  updateCompany(leadId: string, companyId: string, changes: CompanyPatch): void;
}

export function useLeadActions(): LeadActions {
  const { collections, workspaceId } = useRealtime();
  return useMemo(() => createLeadActions(collections, workspaceId), [collections, workspaceId]);
}

type LastWriter = Pick<Lead, "updatedAt" | "updatedBy" | "updatedByTraceId">;

function createLeadActions(collections: LivebaseCollections, workspaceId: string): LeadActions {
  // A lead and its raw input are inserted together, so the list shows the new
  // row with its input straight away. Neither collection has an `onInsert`.
  const insertLead = createOptimisticAction<{ leadId: string; inputId: string; rawText: string }>({
    onMutate: ({ leadId, inputId, rawText }) => {
      const now = new Date();
      const lead: Lead = {
        id: leadId,
        workspaceId,
        title: "",
        stage: "new",
        status: "extracting",
        statusDetail: null,
        personId: null,
        companyId: null,
        value: null,
        fitScore: null,
        summary: null,
        nextStep: null,
        archived: false,
        updatedBy: "user",
        updatedByTraceId: null,
        createdAt: now,
        updatedAt: now,
      };
      const input: LeadInput = { id: inputId, workspaceId, leadId, rawText, kind: null, createdAt: now };
      collections.leads.insert(lead);
      collections.leadInputs.insert(input);
    },
    mutationFn: async (variables) => {
      const { txid } = await createLeadOnServer({ data: variables });
      await Promise.all([
        collections.leads.utils.awaitTxId(txid),
        collections.leadInputs.utils.awaitTxId(txid),
      ]);
    },
  });

  // `leadId` lets the server restart that lead's enrichment.
  const patchPerson = createOptimisticAction<{ leadId: string; personId: string; changes: PersonPatch }>({
    onMutate: ({ personId, changes }) => {
      collections.people.update(personId, (draft) => {
        Object.assign(draft, changes);
        markUserWrite(draft);
      });
    },
    mutationFn: async (variables) => {
      const { txid } = await updatePersonOnServer({ data: variables });
      await collections.people.utils.awaitTxId(txid);
    },
  });

  const patchCompany = createOptimisticAction<{ leadId: string; companyId: string; changes: CompanyPatch }>({
    onMutate: ({ companyId, changes }) => {
      collections.companies.update(companyId, (draft) => {
        Object.assign(draft, changes);
        markUserWrite(draft);
      });
    },
    mutationFn: async (variables) => {
      const { txid } = await updateCompanyOnServer({ data: variables });
      await collections.companies.utils.awaitTxId(txid);
    },
  });

  // Runs the leads collection's `onUpdate`, which sends only the patch fields.
  const patchLead = (leadId: string, changes: LeadPatch) => {
    const transaction = collections.leads.update(leadId, (draft) => {
      Object.assign(draft, changes);
      markUserWrite(draft);
    });
    reportFailure(transaction, "update the lead");
  };

  return {
    createLead(rawText) {
      const leadId = newId();
      const transaction = insertLead({ leadId, inputId: newId(), rawText: rawText.trim() });
      reportFailure(transaction, "create the lead");
      return leadId;
    },
    setStage(leadId, stage) {
      patchLead(leadId, { stage });
    },
    updateLeadFields(leadId, changes) {
      patchLead(leadId, changes);
    },
    setArchived(leadId, archived) {
      patchLead(leadId, { archived });
    },
    deleteLead(leadId) {
      reportFailure(collections.leads.delete(leadId), "delete the lead");
    },
    updatePerson(leadId, personId, changes) {
      reportFailure(patchPerson({ leadId, personId, changes }), "update the person");
    },
    updateCompany(leadId, companyId, changes) {
      reportFailure(patchCompany({ leadId, companyId, changes }), "update the company");
    },
  };
}

// User writes take over the row's highlight from the agent. The server
// stamps the same writer, so the highlight doesn't flip when the write is
// confirmed. Other columns can differ: the server normalizes email and domain
// and stamps its own `updatedAt`.
function markUserWrite(draft: LastWriter): void {
  draft.updatedAt = new Date();
  draft.updatedBy = "user";
  draft.updatedByTraceId = null;
}

// A failed write rolls its optimistic state back by itself. Catching the
// rejection keeps it from surfacing as an unhandled promise, and the toast says
// why the edit snapped back (a clash the client can't check, for example). A
// write rolled back because an earlier write to the same row failed rejects
// with no error.
function reportFailure<T extends object>(transaction: Transaction<T>, action: string): void {
  transaction.isPersisted.promise.catch((error: unknown) => {
    console.error(`Could not ${action}`, error ?? "an earlier write to the same row failed");
    showWriteError(error);
  });
}
