// From guides/queries.md "Setup"
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  preview: { realtime: { allowedOrigins: ["http://localhost:5173"] } },
});
