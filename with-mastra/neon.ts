import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  aiGateway: true,
  functions: {
    agent: {
      name: 'Mastra personal agent',
      source: 'src/index.ts',
      // posthog-node (a Mastra dependency) imports its optional peer
      // @opentelemetry/api inside try/catch; leave it unresolved at bundle time.
      externalPackages: [{ name: '@opentelemetry/api', includeFiles: false }],
    },
  },
});
