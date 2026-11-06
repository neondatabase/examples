import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  functions: {
    cron: {
      name: "Cron Job",
      source: "src/index.ts",
      dev: {
        port: 8787,
      },
    },
  },
  triggers: {
    "every-minute": {
      type: "schedule",
      function: "cron",
      cron: "* * * * *",
      functionPath: "/cron",
    },
  },
});
