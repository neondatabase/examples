import { defineConfig } from "@neondatabase/config/v1";

export default defineConfig({
  // Neon Auth issues the JWTs the chat function verifies and the WebSocket
  // clients authenticate with. Postgres is enabled by default on the branch.
  auth: true,
  preview: {
    // AI Gateway powers the moderation agent; bucket stores uploaded images.
    aiGateway: true,
    buckets: {
      uploads: {},
    },
    functions: {
      chat: {
        name: "realtime chat",
        source: "src/index.ts",
        // Mastra Cloud (Studio) observability credentials, injected at deploy
        // time from .env.deploy (`neonctl deploy --env .env.deploy`). Unset
        // locally so observability is a no-op in dev.
        env: {
          MASTRA_PROJECT_ID: process.env.MASTRA_PROJECT_ID ?? "",
          MASTRA_PLATFORM_ACCESS_TOKEN: process.env.MASTRA_PLATFORM_ACCESS_TOKEN ?? "",
        },
      },
    },
  },
});
