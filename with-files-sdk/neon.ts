import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  buckets: {
    uploads: { access: 'public_read' },
  },
  functions: {
    ingest: {
      name: 'Object ingest',
      source: 'src/index.ts',
      dev: {
        port: 8787,
      },
    },
  },
  triggers: {
    'on-upload': {
      type: 'storage_object_created',
      function: 'ingest',
      bucket: 'uploads',
      prefix: 'logos/',
      functionPath: '/object',
    },
  },
});
