import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    realtime: {
      allowedOrigins: ["http://localhost:5173"],
    },
  },
});
