import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Neon Auth issues the JWTs the API verifies. Postgres is enabled by default on the branch.
  auth: true,
  preview: {
    realtime: {
      allowedOrigins: ["http://localhost:5173"],
    },
  },
});
