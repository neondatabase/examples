import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Postgres is enabled by default on the branch. The `counter` function hosts
  // the SSE server and reads/writes the counter through the injected DATABASE_URL.
  preview: {
    functions: {
      counter: {
        name: "realtime counter",
        source: "src/index.ts",
      },
    },
  },
});
