import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  realtime: {
    allowedOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],
  },
});
