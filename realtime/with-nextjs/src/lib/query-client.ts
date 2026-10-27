import { environmentManager, QueryClient } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 5000 } } });
}

let browserQueryClient: QueryClient | undefined;

// A new client per server render; one client for the browser so a suspended
// first render doesn't discard the cache.
export function getQueryClient() {
  if (environmentManager.isServer()) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
