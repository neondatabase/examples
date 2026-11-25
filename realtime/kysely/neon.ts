import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  realtime: {
    allowedOrigins: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
      "http://localhost:5176",
      "http://127.0.0.1:5176",
    ],
  },
});
