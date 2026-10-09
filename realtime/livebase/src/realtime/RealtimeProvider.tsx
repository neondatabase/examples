import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { DbClient } from "@tanstack/react-db";
import type { DehydratedDbState } from "@tanstack/db";
import type { RealtimeClient } from "@neon/realtime/client";

import type { ConnectionStatus, WorkspaceData } from "~/lib/types";
import { COLLECTION_IDS, createCollectionDescriptors, type CollectionDescriptors } from "~/realtime/collections";
import { useConnectionProbe } from "~/realtime/connection";
import { createLivebaseClient } from "~/realtime/realtime-client";

export interface RealtimeData {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly realtimeClient: RealtimeClient;
  // Use these in `useLiveQuery` `.from()` and `.join()`.
  readonly descriptors: CollectionDescriptors;
  // Collection instances. Only `realtime/actions.ts` mutates them.
  readonly collections: LivebaseCollections;
  readonly connectionStatus: ConnectionStatus;
  // Whether SSR seeded every collection. The seed is the whole workspace, so
  // hooks can treat it as ready before Neon Realtime's first reset arrives.
  readonly seeded: boolean;
}

// The router's DbClient returns the same instance that `useLiveQuery` finds
// for each descriptor ID, already holding the rows hydrated from SSR.
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

export function RealtimeProvider({
  data,
  dbClient,
  children,
}: {
  readonly data: WorkspaceData;
  readonly dbClient: DbClient;
  readonly children: ReactNode;
}) {
  // Hydrate before any collection resolves, so the first render shows the
  // server's rows on both sides.
  const [hydratedDbClient] = useState(() => {
    dbClient.hydrate(data.dbState as unknown as DehydratedDbState);
    return dbClient;
  });
  const [realtimeClient] = useState(createLivebaseClient);
  // Collections refresh their own sealed queries, so only the first loader
  // result matters. A later one, after router invalidation, must not rebuild
  // the descriptors or restart the connection probe.
  const [sealedQueries] = useState(data.sealedQueries);
  // From the same first result, so the server and the hydrating client agree.
  const [seeded] = useState(() => isSeeded(data.dbState));
  const descriptors = useMemo(
    () => createCollectionDescriptors(realtimeClient, sealedQueries),
    [realtimeClient, sealedQueries],
  );
  const collections = useMemo(
    () => resolveCollections(hydratedDbClient, descriptors),
    [hydratedDbClient, descriptors],
  );
  const connectionStatus = useConnectionProbe(realtimeClient, sealedQueries.workspace);

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

// `dehydrate()` lists every seeded collection, even an empty one.
function isSeeded(dbState: WorkspaceData["dbState"]): boolean {
  const seededIds = new Set(dbState.collections.map((chunk) => chunk.collectionId));
  return Object.values(COLLECTION_IDS).every((id) => seededIds.has(id));
}

export function useRealtime(): RealtimeData {
  const value = useContext(RealtimeContext);
  if (!value) throw new Error("useRealtime must be used inside <RealtimeProvider>");
  return value;
}
