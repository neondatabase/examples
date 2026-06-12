import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { createOpenAI } from '@ai-sdk/openai';
import { parseEnv } from '@neondatabase/env/v1';
import config from '../neon';

// Typesafe, validated env — `env.postgres.databaseUrl` / `env.aiGateway.*` instead of
// stringly-typed `process.env` lookups. Reads the env Neon injects into the function
// (and that `neon dev` injects locally); throws a clear error if anything is missing.
const env = parseEnv(config);

// The AI SDK's openai() provider drives the agent's model. `neon dev` injects
// OPENAI_API_KEY + OPENAI_BASE_URL; we pass them through explicitly so the model is
// wired from typed env, not magic globals.
//
// `env.aiGateway.baseUrl` is the gateway's OpenAI *Responses* dialect
// (`.../ai-gateway/openai/v1`). We point at the gateway's unified, OpenAI-compatible
// Chat Completions endpoint (`.../ai-gateway/mlflow/v1`) instead: it serves every model
// in the catalog and plays nicely with multi-step tool calls (Mastra updates working
// memory via a tool call), which the Responses dialect rejects over its 64-char id cap.
const openai = createOpenAI({
  apiKey: env.aiGateway.apiKey,
  baseURL: env.aiGateway.baseUrl.replace('/openai/v1', '/mlflow/v1'),
});

// Any chat model in the Neon AI Gateway catalog works here. Claude is a reliable
// tool-caller, which keeps working-memory updates consistent.
const MODEL = 'databricks-claude-haiku-4-5';

// Mastra persists conversation threads, messages, and per-user working memory in Neon
// Postgres. PostgresStore creates its own tables (mastra_threads, mastra_messages,
// mastra_resources) on first use — there's no separate migration step.
const memory = new Memory({
  storage: new PostgresStore({ id: 'neon', connectionString: env.postgres.databaseUrl }),
  options: {
    // Replay the last 20 messages of the current thread back to the model.
    lastMessages: 20,
    // Resource-scoped working memory: a persistent profile that follows the user
    // across every conversation thread, not just the current one. This is what makes
    // the assistant feel "personal" — it remembers you between sessions.
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
  name: 'personal-assistant',
  instructions: `You are a warm, concise personal assistant with long-term memory.

You remember durable facts about the user across conversations using your working
memory. Whenever the user shares something lasting about themselves — their name, where
they live, their role, what they're working on, their preferences, or their goals —
record it in working memory so you can recall it later. When the user asks what you know
about them, answer from your working memory. Don't ask for information you've already
stored. Keep replies friendly and to the point.`,
  model: openai.chat(MODEL),
  memory,
});
