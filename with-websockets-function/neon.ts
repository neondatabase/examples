import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  // Neon Auth issues the JWTs that WebSocket clients connect with.
  auth: true,
  functions: {
    chat: {
      name: 'WebSocket chat',
      source: 'src/index.ts',
      dev: {
        port: 8787,
      },
    },
  },
});
