import { defineConfig } from '@neondatabase/config/v1';

export default defineConfig({
  preview: {
    // Neon AI Gateway. `neon dev` / `neon env pull` injects OPENAI_API_KEY and
    // OPENAI_BASE_URL (the branch's OpenAI-dialect gateway endpoint), so the AI SDK's
    // `openai()` provider — and therefore the Mastra agent's model — talks to the
    // gateway from env alone.
    aiGateway: true,
    // The agent itself, deployed as a Neon Function. `neon dev` serves it locally.
    functions: {
      agent: {
        name: 'Mastra personal agent',
        source: 'src/index.ts',
      },
    },
  },
});
