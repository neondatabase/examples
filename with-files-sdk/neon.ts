import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
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
        triggers: [
          {
            type: "storage_object_created",
            name: "on-upload",
            bucketName: "assets",
            prefix: "logos/",
            functionPath: "/object",
          },
        ],
      },
    },
  },
});
