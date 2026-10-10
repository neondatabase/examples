import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import {
  companiesQuery,
  findingsQuery,
  leadInputsQuery,
  leadsQuery,
  messagesQuery,
  peopleQuery,
  spansQuery,
  threadsQuery,
  workspaceQuery,
} from "~/server/live-queries.server";
import { realtime } from "~/server/realtime.server";
import { assertLeadInWorkspace, requireWorkspace } from "~/server/workspace.server";

import { parseWith, userErrors } from "./validation";

// One sealed query per live query. The server picks the workspace, never the
// browser, so a client can only subscribe to rows it may see.
// Sealed queries expire after 60 seconds, and each collection calls its
// function again as `refreshQuery`. `userErrors` keeps a database
// error's SQL out of the browser.
//
// A sealed query is a bearer capability, so these are POSTs, which caches don't
// store, and `noStore` tells every cache that does see one not to keep it.

// Set on successful responses. TanStack drops it from a thrown error's
// response, which holds no sealed query.
const noStore = createMiddleware({ type: "function" }).server(async ({ next }) => {
  setResponseHeader("Cache-Control", "private, no-store");
  return next();
});

export const sealLeads = createServerFn({ method: "POST" })
  .middleware([userErrors, noStore])
  .handler(async () => {
    const { workspaceId } = await requireWorkspace();
    return realtime.seal({ query: leadsQuery(workspaceId) });
  });

export const sealPeople = createServerFn({ method: "POST" })
  .middleware([userErrors, noStore])
  .handler(async () => {
    const { workspaceId } = await requireWorkspace();
    return realtime.seal({ query: peopleQuery(workspaceId) });
  });

export const sealCompanies = createServerFn({ method: "POST" })
  .middleware([userErrors, noStore])
  .handler(async () => {
    const { workspaceId } = await requireWorkspace();
    return realtime.seal({ query: companiesQuery(workspaceId) });
  });

export const sealLeadInputs = createServerFn({ method: "POST" })
  .middleware([userErrors, noStore])
  .handler(async () => {
    const { workspaceId } = await requireWorkspace();
    return realtime.seal({ query: leadInputsQuery(workspaceId) });
  });

export const sealFindings = createServerFn({ method: "POST" })
  .middleware([userErrors, noStore])
  .handler(async () => {
    const { workspaceId } = await requireWorkspace();
    return realtime.seal({ query: findingsQuery(workspaceId) });
  });

export const sealThreads = createServerFn({ method: "POST" })
  .middleware([userErrors, noStore])
  .handler(async () => {
    const { workspaceId } = await requireWorkspace();
    return realtime.seal({ query: threadsQuery(workspaceId) });
  });

export const sealSpans = createServerFn({ method: "POST" })
  .middleware([userErrors, noStore])
  .handler(async () => {
    const { workspaceId } = await requireWorkspace();
    return realtime.seal({ query: spansQuery(workspaceId) });
  });

export const sealWorkspace = createServerFn({ method: "POST" })
  .middleware([userErrors, noStore])
  .handler(async () => {
    const { workspaceId } = await requireWorkspace();
    return realtime.seal({ query: workspaceQuery(workspaceId) });
  });

const leadMessagesInput = z.object({ leadId: z.uuid() });

// Messages sync per lead. The lead ID comes from the browser, so check
// that it belongs to the caller's workspace before sealing its thread query.
export const sealLeadMessages = createServerFn({ method: "POST" })
  .middleware([userErrors, noStore])
  .validator(parseWith(leadMessagesInput))
  .handler(async ({ data }) => {
    const { workspaceId } = await requireWorkspace();
    await assertLeadInWorkspace(data.leadId, workspaceId);
    return realtime.seal({ query: messagesQuery(workspaceId, data.leadId) });
  });
