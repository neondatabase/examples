import { defineConfig } from '@neondatabase/config/v1';

export default defineConfig({
  preview: {
    // Neon AI Gateway. `neon dev` / `neon env pull` injects OPENAI_API_KEY and
    // OPENAI_BASE_URL (the branch's OpenAI-dialect gateway endpoint), so the AI SDK's
    // `openai()` provider talks to the gateway from env alone.
    aiGateway: true,
    // S3-compatible object storage. `neon dev` / `neon env pull` mints a branch
    // credential and injects AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY /
    // AWS_ENDPOINT_URL_S3 / AWS_REGION for this bucket, so the AWS S3 client works
    // from env alone.
    buckets: {
      images: {},
    },
    // The agent itself, deployed as a Neon Function. `neon dev` serves it locally.
    functions: {
      imagegen: {
        name: 'AI SDK image agent',
        source: 'src/index.ts',
      },
    },
  },
});
