import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Neon Auth signs users in. Each user's todos are scoped by their user id.
  auth: true,
  preview: {
    realtime: {
      allowedOrigins: ["http://localhost:3000"],
    },
  },
});
