import { defineConfig } from "@neondatabase/config/v1";

export default defineConfig({
  // Neon Auth issues the JWTs the chat function verifies, and the WebSocket
  // clients authenticate with. Postgres is enabled by default on the branch.
  auth: true,
  preview: {
    functions: {
      chat: {
        name: "realtime chat",
        source: "src/index.ts",
      },
    },
  },
});
