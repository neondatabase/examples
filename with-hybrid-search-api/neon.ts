import { existsSync } from "node:fs";
import { defineConfig } from "@neon/config/v1";

// neon dev evaluates this file before it loads the Function's local env.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const provider = process.env.EMBEDDING_PROVIDER ?? "gateway";
if (provider !== "gateway" && provider !== "mock") {
  throw new Error("EMBEDDING_PROVIDER must be gateway or mock");
}

export default defineConfig({
  aiGateway: provider === "gateway",
  buckets: { searchfiles: {} },
  functions: {
    search: {
      name: "Hybrid search API",
      source: "src/index.ts",
      env: {
        SEARCH_API_KEY: process.env.SEARCH_API_KEY!,
        EMBEDDING_PROVIDER: provider,
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
