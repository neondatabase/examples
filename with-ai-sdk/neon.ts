import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  aiGateway: true,
  buckets: {
    images: {},
  },
  functions: {
    imagegen: {
      name: 'AI SDK image generator',
      source: 'src/index.ts',
    },
  },
});
