# TanStack AI on AI Gateway

A Neon Function that runs [TanStack AI](https://tanstack.com/ai) on [Neon AI Gateway](https://neon.com/docs/ai-gateway/overview). The `@tanstack/ai-neon` adapter reaches every model in the gateway catalog with the branch's own credentials, so you don't need a provider API key.

| Route | Default | What it does |
| --- | --- | --- |
| `POST /chat` | yes | Streams a chat reply over SSE in the AG-UI format that `useChat` reads. Includes a sample `getCurrentTime` server tool. |
| `POST /extract` | yes | Returns a typed JSON object validated against a Zod schema. |
| `POST /summarize` | no | Returns a summary in a paragraph, bullet-point, or concise style. |

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new tanstack-ai
```

The CLI asks which routes to include. Pass `--all-operations` to include `/summarize` too. It writes the modules and a router `index.ts` to `functions/tanstackai/`, and declares the function in `neon.ts`.

Enable AI Gateway on the linked branch:

```bash
neon config add ai-gateway
```

Or set `aiGateway: true` in `neon.ts`. AI Gateway requires a paid Neon plan with prepaid credits and a project in a supported region. See the [AI Gateway quickstart](https://neon.com/docs/ai-gateway/get-started).

Function URLs are public, so every route requires a bearer token. Generate one and add it to `.env.local`:

```bash
echo "TANSTACK_AI_FUNCTION_TOKEN=$(openssl rand -hex 32)" >> .env.local
```

Deploy once so Neon provisions the gateway and pulls `NEON_AI_GATEWAY_BASE_URL` and `NEON_AI_GATEWAY_TOKEN` into `.env.local`:

```bash
neon deploy --env .env.local
```

## Run locally

```bash
neon dev
```

`neon dev` loads `.env.local` and injects the branch's AI Gateway credentials. Call the URL it prints. The examples below use `$URL` for that URL and `$TOKEN` for your `TANSTACK_AI_FUNCTION_TOKEN`.

### Chat

`/chat` takes an AG-UI `RunAgentInput` body: `threadId`, `runId`, `messages`, `tools`, and `context`. `useChat` sends it for you. With curl:

```bash
curl -N "$URL/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "threadId": "thread-1",
    "runId": "run-1",
    "messages": [{ "id": "m1", "role": "user", "content": "What time is it in Berlin?" }],
    "tools": [],
    "context": []
  }'
```

The response is a stream of AG-UI events (`RUN_STARTED`, `TOOL_CALL_START`, `TOOL_CALL_RESULT`, `TEXT_MESSAGE_CONTENT`, `RUN_FINISHED`, and so on).

From a React app, point `useChat` at the route:

```tsx
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";

const { messages, sendMessage } = useChat({
  threadId: "thread-1",
  connection: fetchServerSentEvents(`${FUNCTION_URL}/chat`, async () => ({
    headers: { Authorization: `Bearer ${await getToken()}` },
  })),
});
```

`/chat` answers CORS preflight requests from any origin, because the bearer token, not the origin, is what grants access.

### Extract

```bash
curl "$URL/extract" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "text": "Ada Lovelace joined Neon in London on March 3, 2026. Great news!" }'
```

Example response:

```json
{
  "data": {
    "title": "Ada Lovelace joins Neon",
    "people": ["Ada Lovelace"],
    "organizations": ["Neon"],
    "locations": ["London"],
    "dates": ["March 3, 2026"],
    "sentiment": "positive"
  },
  "model": "claude-haiku-5-5"
}
```

`text` can be up to 20,000 characters. Change `ExtractionSchema` in `extract.ts` to extract the fields your app needs.

### Summarize

```bash
curl "$URL/summarize" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "text": "...", "style": "bullet-points", "maxLength": 300 }'
```

`style` is `paragraph` (the default), `bullet-points`, or `concise`. `maxLength` is the token budget the model is asked to stay under, from 100 to 2,000 (default 300). Models often run a little over it, so the hard output limit is twice `maxLength`; a summary cut off at that limit returns `502`. The response is `{ "summary", "model", "usage" }`.

## Errors

| Status | Meaning |
| --- | --- |
| `400` | The body is not JSON or fails validation. |
| `401` | The bearer token is missing or wrong. |
| `405` | The method is not `POST`. |
| `429` | AI Gateway rate limit or daily spend cap reached. |
| `502` | The model request failed, or AI Gateway rejected the branch credentials. |
| `503` | `TANSTACK_AI_FUNCTION_TOKEN` is unset or shorter than 32 characters, or AI Gateway is not enabled. |

`/chat` returns `200` as soon as the stream starts. A model error after that arrives as a `RUN_ERROR` event in the stream, which `useChat` exposes as `error`.

## Customize

- **Model:** every module sets `MODEL = "claude-haiku-5-5"`. Use any text model from the [AI Gateway catalog](https://neon.com/docs/ai-gateway/models); the adapter picks the gateway route for it. Claude 5.5 models reject `temperature` and `topP`, so the template doesn't set them.
- **Prompt and tools:** edit `SYSTEM_PROMPT` and the `tools` array in `chat.ts`. Each tool is a `toolDefinition()` with a Zod input schema and a `.server()` implementation that runs inside the function. See [TanStack AI tools](https://tanstack.com/ai/latest/docs/tools/tools).
- **Auth:** the shared token suits scripts and backend callers. Don't ship it in a browser bundle. For browser apps, verify a short-lived [Neon Auth](https://neon.com/docs/compute/functions/authentication) JWT instead; `fetchServerSentEvents` takes an async options function, so the client can fetch a fresh token for each request.
