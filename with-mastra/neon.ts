import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  preview: {
    aiGateway: true,
    functions: {
      agent: {
        name: 'Mastra personal agent',
        source: 'src/index.ts',
      },
    },
  },
});
