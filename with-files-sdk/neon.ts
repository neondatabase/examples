import { defineConfig } from '@neondatabase/config/v1';

export default defineConfig({
  preview: {
    buckets: {
      assets: { access: 'public_read' },
    },
  },
});
