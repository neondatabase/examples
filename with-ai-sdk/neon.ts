import { defineConfig } from '@neondatabase/config/v1';

export default defineConfig({
  preview: {
    aiGateway: true,
    buckets: {
      images: {},
    },
    functions: {
      imagegen: {
        name: 'AI SDK image agent',
        source: 'src/index.ts',
      },
    },
  },
});
