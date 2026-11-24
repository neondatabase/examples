import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  functions: {
    todos: {
      name: 'Todo API',
      source: 'src/index.ts',
    },
  },
});
