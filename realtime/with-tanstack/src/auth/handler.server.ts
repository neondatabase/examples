import { handleAuthProxyRequest } from "@neondatabase/auth/server";

import { authConfig } from "./auth.server";

// Proxies the browser auth client's requests to Neon Auth and rewrites its
// cookies onto this origin.
export async function handleAuthRequest(request: Request, path: string) {
  const response = await handleAuthProxyRequest({
    request,
    path,
    ...authConfig,
  });
  // Responses like `get-session` are per-user, so no cache may store them.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
