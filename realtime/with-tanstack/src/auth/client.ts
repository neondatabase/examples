import { createAuthClient } from "@neon/auth";
import { BetterAuthReactAdapter } from "@neon/auth/react/adapters";

// The browser's Managed Better Auth client. An empty URL means same-origin
// `/api/auth`, the proxy in `handler.server.ts`. Call its methods in the
// browser only.
export const authClient = createAuthClient("", {
  adapter: BetterAuthReactAdapter(),
});
