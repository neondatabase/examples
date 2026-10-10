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
import { confirmWrite } from "~/realtime/collections";
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
  return useMemo(
    () => (collections ? createLeadActions(collections, workspaceId) : serverLeadActions),
    [collections, workspaceId],
  );
}

// The server doesn't resolve collections, so SSR renders get these. No event
// handler runs during render, so a call here is a bug: fail loudly.
function browserOnly(): never {
  throw new Error("Lead actions run in the browser only");
}

const serverLeadActions: LeadActions = {
  createLead: browserOnly,
  setStage: browserOnly,
  updateLeadFields: browserOnly,
  setArchived: browserOnly,
  deleteLead: browserOnly,
  updatePerson: browserOnly,
  updateCompany: browserOnly,
};

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
        confirmWrite(collections.leads, txid),
        confirmWrite(collections.leadInputs, txid),
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
      await confirmWrite(collections.people, txid);
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
      await confirmWrite(collections.companies, txid);
    },
  });

  // Runs the leads collection's `onUpdate`, which sends only the patch fields.
  const patchLead = (leadId: string, changes: LeadPatch) => {
    reportFailure("update the lead", () => collections.leads.update(leadId, (draft) => {
      Object.assign(draft, changes);
      markUserWrite(draft);
    }));
  };

  return {
    createLead(rawText) {
      const leadId = newId();
      reportFailure("create the lead", () => insertLead({ leadId, inputId: newId(), rawText: rawText.trim() }));
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
      reportFailure("delete the lead", () => collections.leads.delete(leadId));
    },
    updatePerson(leadId, personId, changes) {
      reportFailure("update the person", () => patchPerson({ leadId, personId, changes }));
    },
    updateCompany(leadId, companyId, changes) {
      reportFailure("update the company", () => patchCompany({ leadId, companyId, changes }));
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
//
// `write` runs the optimistic action. Its `onMutate` runs synchronously, so an
// update to a row that isn't loaded throws before there's a transaction to
// watch. That throw is reported here too, or the click handler would throw with
// no toast.
function reportFailure<T extends object>(action: string, write: () => Transaction<T>): void {
  let transaction: Transaction<T>;
  try {
    transaction = write();
  } catch (error) {
    reportError(action, error);
    return;
  }
  transaction.isPersisted.promise.catch((error: unknown) => reportError(action, error));
}

function reportError(action: string, error: unknown): void {
  console.error(`Could not ${action}`, error ?? "an earlier write to the same row failed");
  showWriteError(error);
}
