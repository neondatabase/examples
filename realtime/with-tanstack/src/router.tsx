import { createRealtimeClient } from "@neon/realtime/client";
import { drizzleParsers } from "@neon/realtime-drizzle/client";
import { DbClient } from "@tanstack/react-db";
import { createRouter } from "@tanstack/react-router";
import { routerWithDbClient } from "@tanstack/react-router-with-db";

import { ErrorView, NotFoundView } from "./routes/__root";
import { routeTree } from "./routeTree.gen";

export interface RouterContext {
  readonly dbClient: DbClient;
}

// Runs once per SSR request and once per page load in the browser.
export function getRouter() {
  // Vite inlines this into the server build too, so SSR and the browser agree.
  const url = import.meta.env.VITE_NEON_REALTIME_URL;
  if (!url) {
    throw new Error("VITE_NEON_REALTIME_URL is not set. See the README setup.");
  }
  // Collections read this with `db.requireDependency("realtime")`. On the
  // server it never connects: sync only starts in the browser.
  const realtime = createRealtimeClient({
    url,
    parsers: { ...drizzleParsers },
  });
  const dbClient = new DbClient({ realtime });
  const router = createRouter({
    routeTree,
    context: { dbClient },
    scrollRestoration: true,
    defaultErrorComponent: ErrorView,
    defaultNotFoundComponent: NotFoundView,
  });
  // Snapshots the collections loaders filled on the server, and restores them
  // in the browser before the first render.
  return routerWithDbClient(router, dbClient);
}
