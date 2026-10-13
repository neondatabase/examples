import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

// The browser's Neon Auth client. An empty URL means same-origin `/api/auth`,
// the proxy in `routes/api/auth/$.ts`. Call its methods in the browser only.
export const authClient = createAuthClient("", {
  adapter: BetterAuthReactAdapter(),
});
