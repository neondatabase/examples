import { existsSync } from "node:fs";
import { defineConfig } from "@neon/config/v1";

// neon dev evaluates this file before it loads the Function's local env.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  aiGateway: true,
  buckets: { searchfiles: {} },
  functions: {
    search: {
      name: "Hybrid search API",
      source: "src/index.ts",
      env: {
        SEARCH_API_KEY: process.env.SEARCH_API_KEY!,
      },
      dev: { port: 8787 },
    },
  },
  triggers: {
    "search-file-uploaded": {
      type: "storage_object_created",
      function: "search",
      bucket: "searchfiles",
      prefix: "documents/",
      functionPath: "/triggers/object-created",
    },
    "search-file-reconcile": {
      type: "schedule",
      function: "search",
      cron: "0 * * * *",
      functionPath: "/triggers/reconcile",
    },
  },
});
