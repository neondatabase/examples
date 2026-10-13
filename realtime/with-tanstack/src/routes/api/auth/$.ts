import { handleAuthProxyRequest } from "@neondatabase/auth/server";
import { createFileRoute } from "@tanstack/react-router";

import { authConfig } from "../../../auth.server";

// Proxies the browser auth client's requests to Neon Auth and rewrites its
// cookies onto this origin.
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      ANY: async ({ request, params }) => {
        const response = await handleAuthProxyRequest({
          request,
          path: params._splat ?? "",
          ...authConfig,
        });
        // Responses like `get-session` are per-user, so no cache may store them.
        response.headers.set("Cache-Control", "private, no-store");
        return response;
      },
    },
  },
});
