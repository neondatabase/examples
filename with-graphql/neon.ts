import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  functions: {
    graphql: {
      name: "GraphQL API",
      source: "src/index.ts",
      dev: {
        port: 8787,
      },
    },
  },
});
