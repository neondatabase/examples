import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  buckets: {
    assets: { access: "public_read" },
  },
  functions: {
    ingest: {
      name: "Object ingest",
      source: "src/index.ts",
      dev: {
        port: 8787,
      },
    },
  },
  triggers: {
    "on-upload": {
      type: "storage_object_created",
      function: "ingest",
      bucket: "assets",
      prefix: "logos/",
      functionPath: "/object",
    },
  },
});
