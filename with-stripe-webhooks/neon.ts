import { defineConfig } from "@neon/config/v1";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  auth: false,
  branch: (branch) => {
    if (branch.isDefault) { return {}; }
    if (!branch.exists) { return { ttl: "7d" }; }
    return {};
  },
  preview: {
    functions: {
      stripe: {
        name: "Stripe webhooks",
        source: "src/index.ts",
        env: {
          STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET!,
        },
        dev: {
          port: 8787,
        },
      },
    },
  },
});

