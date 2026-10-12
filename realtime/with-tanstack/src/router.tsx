import { DbClient } from "@tanstack/react-db";
import { createRouter } from "@tanstack/react-router";
import { routerWithDbClient } from "@tanstack/react-router-with-db";
import { createIsomorphicFn } from "@tanstack/react-start";

import { routeTree } from "./routeTree.gen";

export interface RouterContext {
  readonly dbClient: DbClient;
}

const runtime = createIsomorphicFn()
  .server(() => "server" as const)
  .client(() => "browser" as const);

export function getRouter() {
  const dbClient = new DbClient({ runtime: runtime() });
  const router = createRouter({
    routeTree,
    context: { dbClient },
    scrollRestoration: true,
  });
  return routerWithDbClient(router, dbClient);
}
