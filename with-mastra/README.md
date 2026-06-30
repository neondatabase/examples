<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Mastra

A personal-assistant agent built with [Mastra](https://mastra.ai) on Neon Functions: it streams chat through the [Neon AI Gateway](https://neon.com) and uses [Mastra Memory](https://mastra.ai/docs/memory/overview) — backed by [Neon](https://neon.com) Postgres — to remember who you are across conversations.

## Project structure

```
with-mastra/
├── neon.ts             # Neon Functions policy (defineConfig) — AI Gateway + function
├── tsconfig.json
├── .env.example        # Environment variables injected by neon link / neon dev
├── src/
│   ├── index.ts        # Neon Function entry: POST chat → streamed reply
│   ├── agent.ts        # Mastra agent + Memory (PostgresStore on Neon) + gateway model
│   └── mastra/
│       └── index.ts    # Mastra instance (registers the agent for Mastra Studio)
└── package.json
```

## Clone the repository

```bash
npx degit neondatabase/examples/with-mastra ./with-mastra
cd with-mastra
```

## Install and authenticate the Neon CLI

```bash
npm i -g neon
neon login
```

## Install dependencies

```bash
npm install
```

## Link your Neon project

Link (or create) a Neon project by running the `link` command from the workspace root:

```bash
neon link
```

If you let your agent drive this, add `--agent` to skip interactive mode.

> The Neon AI Gateway is a Preview feature. Link to a project/region where AI Gateway early access is enabled, otherwise `neon dev` / `neon deploy` can't mint the gateway credentials.

## Provision and deploy

Provision the services declared in `neon.ts`:

```bash
neon deploy
```

> Note: `neon deploy` automatically runs an `env pull` that fetches the declared services' credentials and environment variables and writes them to a local `.env.local` file for development.

## Run locally

```bash
neon dev
```

### Have a conversation (same thread)

In another shell (use the port `neon dev` printed), send the first turn. You only send the newest message — memory replays the history:

```bash
curl -N -X POST http://localhost:8787 \
  -H 'content-type: application/json' \
  -d '{
    "resourceId": "user-123",
    "threadId": "thread-a",
    "messages": [{"role":"user","content":"Hi! I'\''m Andre. I live in Munich and I love Postgres and hiking."}]
  }'
```

Send a follow-up on the **same `threadId`** — it remembers the conversation so far:

```bash
curl -N -X POST http://localhost:8787 \
  -H 'content-type: application/json' \
  -d '{
    "resourceId": "user-123",
    "threadId": "thread-a",
    "messages": [{"role":"user","content":"Given where I live, suggest a weekend hike."}]
  }'
```

### Memory across threads

Start a **new thread** for the **same `resourceId`** and watch it still know you:

```bash
curl -N -X POST http://localhost:8787 \
  -H 'content-type: application/json' \
  -d '{
    "resourceId": "user-123",
    "threadId": "thread-b",
    "messages": [{"role":"user","content":"What do you know about me?"}]
  }'
```

The assistant recalls your name, location, and interests in the new thread because its working memory is **resource-scoped** — keyed to `resourceId`, not the thread. You can confirm it landed in Neon:

```sql
SELECT id, "workingMemory" FROM mastra_resources;
```

Mastra's `PostgresStore` creates its own tables (`mastra_threads`, `mastra_messages`, `mastra_resources`) on first use, so there is no separate migration step.

## Chat in Mastra Studio

Prefer a UI? [Mastra Studio](https://mastra.ai) gives you a local chat playground for the agent. With your env in place (the `.env.local` written by `neon deploy`), run:

```bash
npm run studio
```

Open the printed URL (e.g. `http://localhost:4112`), pick the **personal-assistant** agent, and chat. Studio reads the same `DATABASE_URL` and Neon AI Gateway credentials from `.env.local`; the agent is registered for Studio in `src/mastra/index.ts`.

## How memory works

- **`resourceId`** identifies the user. Working memory is scoped to it, so it persists across all of that user's threads — that's what makes the assistant feel personal.
- **`threadId`** identifies a single conversation. Reuse it to continue a conversation (the last messages are replayed to the model); use a new id to start fresh.
- The agent updates its working memory by calling a tool, then the profile is upserted into the `mastra_resources` table in your Neon database.

Because memory supplies the conversation history, you only need to send the newest user message in each request — you don't have to resend the whole transcript.

## Test your deployed function

You already deployed the agent in the provisioning step. Grab its invocation URL and call it (redeploy after changes with `neon deploy`):

```bash
# List the function to find its invocation URL
neon functions get agent

# Then call it (replace with your URL)
curl -N -X POST https://<your-branch>-agent.compute.<region>.aws.neon.tech \
  -H 'content-type: application/json' \
  -d '{
    "resourceId": "user-123",
    "messages": [{"role":"user","content":"Remind me what we talked about."}]
  }'
```
