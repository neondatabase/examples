# Mastra agent with Postgres memory

This Neon Function runs a [Mastra](https://mastra.ai) agent on [Neon AI Gateway](https://neon.com/docs/ai-gateway/overview) and keeps its memory in your Neon Postgres database. Mastra's built-in `neon/` models use the branch's own gateway credentials, so you don't need a provider API key.

<Operations>

| Route | Default | What it does |
| --- | --- | --- |
| `POST /chat` | yes | Streams a reply in the AI SDK UI message format that `useChat` reads. Mastra Memory replays the thread's recent messages and keeps a profile per user that every thread of that user shares. The agent has a sample `getCurrentTime` tool. |
| `POST /history` | yes | Returns a thread's messages as `UIMessage`s, so a UI can restore a conversation after a reload. |
| `POST /review` | no | Runs a human-in-the-loop workflow. An agent drafts text from a brief, and the run suspends until someone approves it, rejects it, or asks for a revision. |

</Operations>

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new mastra
```

The CLI asks which routes to include, and `--all-operations` includes `/review` too. It writes the modules and a router `index.ts` to `functions/mastra/` and declares the function in `neon.ts`.

Enable AI Gateway on the linked branch:

```bash
neon config add ai-gateway
```

You can also set `aiGateway: true` in `neon.ts`. AI Gateway requires a paid Neon plan with prepaid credits and a project in a supported region. See the [AI Gateway quickstart](https://neon.com/docs/ai-gateway/get-started).

Function URLs are public, so every route requires a bearer token. Generate one and add it to `.env.local`:

```bash
echo "MASTRA_FUNCTION_TOKEN=$(openssl rand -hex 32)" >> .env.local
```

<EnvironmentVariables>

- `MASTRA_FUNCTION_TOKEN`: A random token of at least 32 characters, for example from `openssl rand -hex 32`, that callers send as `Authorization: Bearer <token>`. Neon Function URLs are public, so the function requires it.

</EnvironmentVariables>

Deploy once so Neon provisions the gateway and pulls `DATABASE_URL`, `NEON_AI_GATEWAY_BASE_URL`, and `NEON_AI_GATEWAY_TOKEN` into `.env.local`:

```bash
neon deploy --env .env.local
```

## Run locally

```bash
neon dev
```

`neon dev` loads `.env.local`, injects the branch's database and AI Gateway credentials, and prints the URL to call. The examples below use `$URL` for that URL and `$TOKEN` for your `MASTRA_FUNCTION_TOKEN`.

### Chat

`/chat` takes the body `useChat` sends (`id`, `messages`, `trigger`) plus a `resourceId`. The chat `id` is the Mastra thread id, and `resourceId` identifies the user whose memory the request reads and writes:

```bash
curl -N "$URL/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "thread-a",
    "resourceId": "user-ada",
    "messages": [{ "id": "m1", "role": "user", "parts": [{ "type": "text", "text": "Hi! I am Ada, I live in Lisbon and I love sailing." }] }]
  }'
```

The agent records lasting facts in its working memory. Start a new thread for the same `resourceId` and it still knows them:

```bash
curl -N "$URL/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "thread-b",
    "resourceId": "user-ada",
    "messages": [{ "id": "m2", "role": "user", "parts": [{ "type": "text", "text": "What do you know about me?" }] }]
  }'
```

`useChat` resends the whole conversation on every turn, but `/chat` passes only the latest turn to the agent. Memory already stores the thread and replays its last 20 messages, so the prompt doesn't repeat the history and a long thread doesn't make the prompt grow.

From a React app with the AI SDK, point `useChat` at the route and restore the thread from `/history`:

```tsx
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

const { messages, sendMessage } = useChat({
  id: threadId,
  messages: initialMessages, // the `messages` returned by /history
  transport: new DefaultChatTransport({
    api: `${FUNCTION_URL}/chat`,
    headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
    body: { resourceId: userId },
  }),
});
```

`/chat` and `/history` answer CORS preflight requests from any origin, because the bearer token grants access whatever the origin.

User messages may contain text parts and file parts. A file part needs a `mediaType` and a `data:` URL, which is how `useChat` sends attached files. `/chat` accepts only `data:` URLs because Mastra would fetch any other URL from inside the function. It drops every other field of a user message part.

### History

```bash
curl "$URL/history" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "threadId": "thread-a", "resourceId": "user-ada" }'
```

The response is `{ "threadId", "messages" }` with up to the 100 newest messages, oldest first. A thread that doesn't exist, or that belongs to another `resourceId`, returns `404`.

### Review

Start a run with a brief:

```bash
curl "$URL/review" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "brief": "Announce to customers that our app now supports dark mode. Under 50 words." }'
```

```json
{ "runId": "86fe515c-…", "status": "awaiting_review", "draft": "Dark mode is here! …" }
```

Resume it with the `runId`. With `approved: false` and `feedback`, the agent revises the draft and the run suspends again. `approved: false` without feedback ends the run as `rejected`, and `approved: true` ends it as `approved`. To ask for a revision:

```bash
curl "$URL/review" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "runId": "86fe515c-…", "approved": false, "feedback": "Make it more playful." }'
```

```json
{ "runId": "86fe515c-…", "status": "awaiting_review", "draft": "Dark mode is here! 🌙 …" }
```

Then approve the revised draft to finish the run:

```bash
curl "$URL/review" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "runId": "86fe515c-…", "approved": true }'
```

```json
{ "runId": "86fe515c-…", "status": "approved", "text": "Dark mode is here! 🌙 …" }
```

Mastra stores the run's state as a snapshot in Postgres, so any instance can resume it, including after a redeploy, from `neon dev`, or days later. An unknown `runId` returns `404`, and a run that already finished returns `409`.

## Where the data lives

`PostgresStore` creates Mastra's tables in a `mastra` schema on first use, so they stay out of your `public` schema and there's no migration step. Memory is in `mastra.mastra_threads`, `mastra.mastra_messages`, and `mastra.mastra_resources` (the per-user working memory). Workflow runs are in `mastra.mastra_workflow_snapshot`.

```sql
SELECT id, "workingMemory" FROM mastra.mastra_resources;
```

## Errors

| Status | Meaning |
| --- | --- |
| `400` | The body is not JSON or fails validation. |
| `401` | The bearer token is missing or wrong. |
| `404` | `/chat`: the thread belongs to another `resourceId`. `/history`: no such thread for this `resourceId`. `/review`: no such run. |
| `405` | The method is not `POST`. |
| `409` | `/chat`: a message id already belongs to another thread. `/review`: the run is not awaiting review. |
| `502` | The model, database, or workflow failed. The function logs the cause. |
| `503` | `MASTRA_FUNCTION_TOKEN` is unset or shorter than 32 characters, or `DATABASE_URL` or AI Gateway is missing. |

`/chat` returns `200` as soon as the stream starts. A model error after that arrives as an `error` chunk in the stream, which `useChat` exposes as `error`.

## Notes

- **Model.** Every module sets `MODEL = "neon/claude-haiku-5-5"`. You can use any text model from the [AI Gateway catalog](https://neon.com/docs/ai-gateway/models) with the `neon/` prefix. Mastra sends GPT models to the gateway's Responses route and every other model to Chat Completions.
- **Auth.** The shared token suits scripts and backend callers, which set `resourceId` for the user they've signed in. Don't ship the token in a browser bundle, and don't let browsers choose their own `resourceId`. For browser apps, verify a short-lived [Neon Auth](https://neon.com/docs/compute/functions/authentication) JWT instead and use its `sub` claim as the `resourceId`.
- **Telemetry.** Mastra can send usage telemetry to PostHog. The modules set `MASTRA_TELEMETRY_DISABLED` to `true` unless you've set it yourself. Set it to `false` to opt in.
- **Cold start.** Mastra is a large dependency, so the first request to a new instance takes a couple of seconds while it loads. Later requests to that instance don't wait.
- **`@opentelemetry/api`.** Mastra's PostHog client has an optional import of `@opentelemetry/api`, so the template depends on it to let the bundler resolve that import.
- **Customize.** Change the agent's `instructions`, the working memory `template`, and `tools` in `chat.ts`, or the steps of the workflow in `review.ts`. See the [Mastra docs](https://mastra.ai/docs) for memory, tools, and workflows.
