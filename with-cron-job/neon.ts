import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    functions: {
      cron: {
        name: "Cron Job",
        source: "src/index.ts",
        triggers: [
          {
            type: "schedule",
            name: "every-minute",
            cron: "* * * * *",
            functionPath: "/cron",
          },
        ],
      },
    },
  },
});
