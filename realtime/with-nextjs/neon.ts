import { defineConfig } from "@neon/config/v1";

// `neon deploy` applies this to the linked branch: it enables Managed Better Auth and Realtime, then writes .env.local.
export default defineConfig({
  auth: true,
  preview: {
    realtime: {
      // Browser origins allowed to open the Realtime WebSocket. Add each deployed origin, then run `neon deploy`.
      // A missing origin doesn't error: the list just stays on "Connecting…".
      allowedOrigins: ["http://localhost:3000"],
    },
  },
});
