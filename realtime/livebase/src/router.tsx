import type { RealtimeClient } from "@neon/realtime/client";
import { DbClient } from "@tanstack/react-db";
import { createRouter } from "@tanstack/react-router";
import { routerWithDbClient } from "@tanstack/react-router-with-db";

import { createConnectionStore, type ConnectionStore } from "~/realtime/connection-store";
import { createLivebaseClient } from "~/realtime/realtime-client";

import { RouteError } from "./routes/__root";
import { routeTree } from "./routeTree.gen";

export interface RouterContext {
  readonly dbClient: DbClient;
  readonly realtimeClient: RealtimeClient;
  readonly connection: ConnectionStore;
}

// One Realtime client per router, so every collection and the connection probe
// share one socket. The browser's router lives for the page; the server makes
// one per request. Remounts reuse it, because collections keep the client they
// were first given.
export function getRouter() {
  const dbClient = new DbClient();
  const connection = createConnectionStore();
  const realtimeClient = createLivebaseClient(connection.onEntry);
  const router = createRouter({
    routeTree,
    context: { dbClient, realtimeClient, connection },
    scrollRestoration: true,
    // Each page gets its own error boundary, so a page error leaves the root
    // (the app shell and the Realtime provider) mounted.
    defaultErrorComponent: RouteError,
  });
  return routerWithDbClient(router, dbClient);
}
