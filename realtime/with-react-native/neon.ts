import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    realtime: {
      // The app explicitly sends this origin from its native WebSocket, and
      // the sibling React example uses it as its actual browser origin.
      allowedOrigins: ["http://localhost:5173"],
    },
  },
});
