import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Neon Auth issues the JWTs the chat function verifies, and the WebSocket
  // clients authenticate with. Postgres is enabled by default on the branch.
  auth: true,
  functions: {
    chat: {
      name: "realtime chat",
      source: "src/index.ts",
      dev: {
        port: 8787,
      },
    },
  },
});
