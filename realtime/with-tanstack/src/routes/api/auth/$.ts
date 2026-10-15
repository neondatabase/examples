import { createFileRoute } from "@tanstack/react-router";

import { handleAuthRequest } from "../../../auth/handler.server";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      ANY: ({ request, params }) =>
        handleAuthRequest(request, params._splat ?? ""),
    },
  },
});
