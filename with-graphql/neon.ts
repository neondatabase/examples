import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    functions: {
      graphql: {
        name: "GraphQL API",
        source: "src/index.ts",
        dev: {
          port: 8787,
        },
      },
    },
  },
});
