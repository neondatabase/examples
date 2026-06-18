import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { parseEnv } from '@neondatabase/env/v1';
import config from '../neon';

const env = parseEnv(config);

const MODEL = 'claude-haiku-4-5';

const memory = new Memory({
  storage: new PostgresStore({ id: 'neon', connectionString: env.postgres.databaseUrl }),
  options: {
    lastMessages: 20,
    workingMemory: {
      enabled: true,
      scope: 'resource',
      template: `# User Profile
- Name:
- Location / timezone:
- Role / what they work on:
- Current projects:
- Interests:
- Communication preferences (tone, format, length):
- Long-term goals:
- Other durable facts:
`,
    },
  },
});

export const personalAssistant = new Agent({
  id: 'personal-assistant',
  name: 'personal-assistant',
  instructions: `You are a warm, concise personal assistant with long-term memory.

You remember durable facts about the user across conversations using your working
memory. Whenever the user shares something lasting about themselves — their name, where
they live, their role, what they're working on, their preferences, or their goals —
record it in working memory so you can recall it later. When the user asks what you know
about them, answer from your working memory. Don't ask for information you've already
stored. Keep replies friendly and to the point.`,
  model: {
    id: `neon/${MODEL}`,
    url: env.aiGateway.baseUrl,
    apiKey: env.aiGateway.apiKey,
  },
  memory,
});
