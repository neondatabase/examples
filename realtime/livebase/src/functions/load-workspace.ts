import { DbClient } from "@tanstack/react-db";
import { createServerFn } from "@tanstack/react-start";

import type { LivebaseDbState, SealedWorkspaceQueries, WorkspaceData } from "~/lib/types";
import { createCollectionDescriptors } from "~/realtime/collections";
import { createLivebaseClient } from "~/realtime/realtime-client";
import {
  companiesQuery,
  findingsQuery,
  leadInputsQuery,
  leadsQuery,
  peopleQuery,
  spansQuery,
  threadsQuery,
  workspaceQuery,
} from "~/server/live-queries.server";
import { realtime } from "~/server/realtime.server";
import { getRunner } from "~/server/runner.server";
import { requireWorkspace } from "~/server/workspace.server";

import { userErrors } from "./validation";

// SSR seeding: execute and seal every workspace query, seed a
// request-scoped `DbClient`, and dehydrate it. The browser hydrates the same
// rows and then goes live from those sealed queries. This lives apart from
// `seal.ts` because `realtime/collections.ts` imports that file, and this
// loader imports `realtime/collections.ts`. The root error page shows the error's
// message, so `userErrors` keeps a database error's SQL off it.
export const loadWorkspaceData = createServerFn({ method: "GET" })
  .middleware([userErrors])
  .handler(async (): Promise<WorkspaceData> => {
    const { workspaceId, workspaceName } = await requireWorkspace();
    // Leads interrupted by a restart are marked failed first, so the first
    // render never shows a stale "extracting" status.
    await getRunner().ready;

    // Each query is built twice: awaited for the SSR rows, and handed to
    // `seal()`, which only encrypts it into a sealed query. All fifteen
    // run concurrently.
    const [
      leadRows,
      personRows,
      companyRows,
      leadInputRows,
      findingRows,
      threadRows,
      spanRows,
      leads,
      people,
      companies,
      leadInputs,
      findings,
      threads,
      spans,
      workspace,
    ] = await Promise.all([
      leadsQuery(workspaceId),
      peopleQuery(workspaceId),
      companiesQuery(workspaceId),
      leadInputsQuery(workspaceId),
      findingsQuery(workspaceId),
      threadsQuery(workspaceId),
      spansQuery(workspaceId),
      realtime.seal({ query: leadsQuery(workspaceId) }),
      realtime.seal({ query: peopleQuery(workspaceId) }),
      realtime.seal({ query: companiesQuery(workspaceId) }),
      realtime.seal({ query: leadInputsQuery(workspaceId) }),
      realtime.seal({ query: findingsQuery(workspaceId) }),
      realtime.seal({ query: threadsQuery(workspaceId) }),
      realtime.seal({ query: spansQuery(workspaceId) }),
      realtime.seal({ query: workspaceQuery(workspaceId) }),
    ]);
    const sealedQueries: SealedWorkspaceQueries = {
      leads,
      people,
      companies,
      leadInputs,
      findings,
      threads,
      spans,
      workspace,
    };

    // The live client never connects: its WebSocket opens lazily, and nothing
    // subscribes before cleanup.
    const realtimeClient = createLivebaseClient();
    const dbClient = new DbClient({ runtime: "server" });
    try {
      const descriptors = createCollectionDescriptors(realtimeClient, sealedQueries);
      dbClient.collection(descriptors.leads, { initialData: [...leadRows] });
      dbClient.collection(descriptors.people, { initialData: [...personRows] });
      dbClient.collection(descriptors.companies, { initialData: [...companyRows] });
      dbClient.collection(descriptors.leadInputs, { initialData: [...leadInputRows] });
      dbClient.collection(descriptors.findings, { initialData: [...findingRows] });
      dbClient.collection(descriptors.threads, { initialData: [...threadRows] });
      dbClient.collection(descriptors.spans, { initialData: [...spanRows] });
      // The seeded collections hold only these row shapes. Narrowing
      // TanStack's generic `unknown` metadata lets Start prove the loader
      // result is serializable.
      const dbState = dbClient.dehydrate() as unknown as LivebaseDbState;
      return { workspaceId, workspaceName, sealedQueries, dbState };
    } finally {
      // Runs before the result is returned, and also if seeding throws.
      await dbClient.cleanup();
      realtimeClient.close();
    }
  });
