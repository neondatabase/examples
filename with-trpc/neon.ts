import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    functions: {
      trpc: {
        name: "tRPC API",
        source: "src/index.ts",
        dev: {
          port: 8787,
        },
      },
    },
  },
});
