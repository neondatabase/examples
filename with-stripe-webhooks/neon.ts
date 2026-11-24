import { defineConfig } from '@neon/config/v1';
import { config } from 'dotenv';

config({ path: '.env.local' });

export default defineConfig({
  auth: false,
  // New preview branches expire after a week.
  branch: (branch) => (branch.exists ? {} : { ttl: '7d' }),
  functions: {
    stripe: {
      name: 'Stripe webhooks',
      source: 'src/index.ts',
      env: {
        STRIPE_WEBHOOK_SECRET: { value: process.env.STRIPE_WEBHOOK_SECRET, required: true },
      },
      dev: {
        port: 8787,
      },
    },
  },
});
