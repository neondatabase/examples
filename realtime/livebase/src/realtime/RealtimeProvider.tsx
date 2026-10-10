import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DbClient } from "@tanstack/react-db";
import type { DehydratedDbState } from "@tanstack/db";
import type { RealtimeClient } from "@neon/realtime/client";

import type { ConnectionStatus, LivebaseDbState, WorkspaceData } from "~/lib/types";
import { COLLECTION_IDS, createCollectionDescriptors, type CollectionDescriptors } from "~/realtime/collections";
import { useConnectionProbe } from "~/realtime/connection";
import type { ConnectionStore } from "~/realtime/connection-store";

export interface RealtimeData {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly realtimeClient: RealtimeClient;
  // Use these in `useLiveQuery` `.from()` and `.join()`.
  readonly descriptors: CollectionDescriptors;
  // Collection instances, browser only. The server doesn't resolve them, so
  // only the browser-side mutations in `realtime/actions.ts` read these.
  readonly collections: LivebaseCollections | undefined;
  readonly connectionStatus: ConnectionStatus;
  // Whether SSR seeded every collection. The seed is the whole workspace, so
  // hooks can treat it as ready before Neon Realtime's first reset arrives.
  readonly seeded: boolean;
}

// The router's DbClient returns the same instance that `useLiveQuery` finds
// for each descriptor ID, already holding the rows hydrated from SSR. Only the
// browser calls this: `collection()` marks a collection for dehydration, which
// would send its rows to the browser a second time.
function resolveCollections(dbClient: DbClient, descriptors: CollectionDescriptors) {
  return {
    leads: dbClient.collection(descriptors.leads),
    people: dbClient.collection(descriptors.people),
    companies: dbClient.collection(descriptors.companies),
    leadInputs: dbClient.collection(descriptors.leadInputs),
    findings: dbClient.collection(descriptors.findings),
    threads: dbClient.collection(descriptors.threads),
    spans: dbClient.collection(descriptors.spans),
  };
}

// One `Collection<Row, string, RealtimeCollectionUtils>` per descriptor, so
// `utils.awaitTxId()` is available on each.
export type LivebaseCollections = ReturnType<typeof resolveCollections>;

const RealtimeContext = createContext<RealtimeData | null>(null);

// The rows are hydrated once per DbClient. A remount after "Try again" keeps the
// rows the collections already hold: the router's DbClient outlives the root
// component, and a later loader result would only add stale rows back.
const hydratedDbClients = new WeakSet<DbClient>();

function hydrateOnce(dbClient: DbClient, dbState: LivebaseDbState): void {
  if (hydratedDbClients.has(dbClient)) return;
  hydratedDbClients.add(dbClient);
  // `unknown` hop: see `load-workspace.ts`, which narrows the same type.
  dbClient.hydrate(dbState as unknown as DehydratedDbState);
}

export function RealtimeProvider({
  data,
  dbClient,
  realtimeClient,
  connection,
  children,
}: {
  readonly data: WorkspaceData;
  readonly dbClient: DbClient;
  readonly realtimeClient: RealtimeClient;
  readonly connection: ConnectionStore;
  readonly children: ReactNode;
}) {
  // Collections refresh their own sealed queries, so only the first loader
  // result matters. A later one, after router invalidation, must not rebuild
  // the descriptors or restart the connection probe.
  const [sealedQueries] = useState(data.sealedQueries);
  // Hydrate before any collection resolves, so the first render shows the
  // server's rows on both sides. `seeded` comes from the same first result.
  const [seeded] = useState(() => {
    hydrateOnce(dbClient, data.dbState);
    return isSeeded(data.dbState);
  });
  const descriptors = useMemo(
    () => createCollectionDescriptors(realtimeClient, sealedQueries),
    [realtimeClient, sealedQueries],
  );
  const collections = useMemo(
    () => (typeof window === "undefined" ? undefined : resolveCollections(dbClient, descriptors)),
    [dbClient, descriptors],
  );
  // `createLead` awaits its insert's txid, which rejects unless the collection
  // is syncing. Those collections sync only while something reads them, and
  // `/` reads them only while the list is mounted. So hold a subscription for
  // the provider's lifetime.
  useEffect(() => {
    if (!collections) return;
    const subscriptions = [collections.leads, collections.leadInputs].map((collection) =>
      collection.subscribeChanges(() => undefined),
    );
    return () => {
      for (const subscription of subscriptions) subscription.unsubscribe();
    };
  }, [collections]);
  const connectionStatus = useConnectionProbe(realtimeClient, sealedQueries.workspace, connection);

  const value = useMemo<RealtimeData>(
    () => ({
      workspaceId: data.workspaceId,
      workspaceName: data.workspaceName,
      realtimeClient,
      descriptors,
      collections,
      connectionStatus,
      seeded,
    }),
    [data.workspaceId, data.workspaceName, realtimeClient, descriptors, collections, connectionStatus, seeded],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

// `dehydrate()` lists every seeded collection, even an empty one. The loader
// seeds every entry in `COLLECTION_IDS`.
function isSeeded(dbState: WorkspaceData["dbState"]): boolean {
  const seededIds = new Set(dbState.collections.map((chunk) => chunk.collectionId));
  return Object.values(COLLECTION_IDS).every((id) => seededIds.has(id));
}

export function useRealtime(): RealtimeData {
  const value = useContext(RealtimeContext);
  if (!value) throw new Error("useRealtime must be used inside <RealtimeProvider>");
  return value;
}
