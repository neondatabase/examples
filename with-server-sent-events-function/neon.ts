import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  functions: {
    counter: {
      name: 'SSE counter',
      source: 'src/index.ts',
    },
  },
});
