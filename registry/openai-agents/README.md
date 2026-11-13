# OpenAI Agents SDK starter

This template is an [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/) starter that runs on Neon Functions and [Neon AI Gateway](https://neon.com/docs/ai-gateway/overview). AI Gateway is OpenAI-compatible, so the template uses the branch's gateway credentials instead of an OpenAI API key.

<Operations>

| Route | Default | What it does |
| --- | --- | --- |
| `POST /chat` | yes | Streams a reply from an agent with a `rollDice` tool as plain text. |
| `POST /triage` | yes | Hands a support request to a billing or technical agent and reports which one answered. |
| `POST /extract` | no | Returns typed JSON from an agent with a Zod `outputType`. |

</Operations>

## Scaffold it

```bash
npm install -g neon@latest
neon login
neon link
neon functions new openai-agents
```

The CLI asks which routes to include, and `--all-operations` includes `/extract` too. It writes the modules and a router `index.ts` under `functions/openaiagents/` and declares the function in `neon.ts`.

Enable AI Gateway on the linked branch:

```bash
neon config add ai-gateway
```

AI Gateway requires prepaid credits and a project in a supported region. See the [AI Gateway quickstart](https://neon.com/docs/ai-gateway/get-started) and [prepaid credits](https://neon.com/docs/ai-gateway/prepaid-credits).

Deploy once so Neon provisions the gateway and pulls `NEON_AI_GATEWAY_BASE_URL` and `NEON_AI_GATEWAY_TOKEN` into `.env.local`:

```bash
neon deploy --env .env.local
```

## Run locally

```bash
neon dev
```

`neon dev` loads `.env.local`, injects the branch's AI Gateway credentials, and prints the URL to call. The examples below use `$URL` for that URL.

### Chat

```bash
curl -N -X POST "$URL/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Roll 3 dice and tell me the total."}]}'
```

The response is a plain-text stream.

### Triage

```bash
curl -X POST "$URL/triage" \
  -H "Content-Type: application/json" \
  -d '{"message":"I was charged twice for my subscription."}'
```

Example response:

```json
{
  "agent": "billing",
  "reply": "I'm sorry about the duplicate charge. ..."
}
```

### Extract

```bash
curl -X POST "$URL/extract" \
  -H "Content-Type: application/json" \
  -d '{"text":"Ada Lovelace has user ID 12345, and signed up with ada@example.com. She has been a member since 2026-01-04."}'
```

Example response:

```json
{
  "data": {
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "joinedAt": "2026-01-04"
  },
  "model": "gpt-5-mini"
}
```

Change `ContactSchema` in `extract.ts` to extract the fields your app needs.

## Authentication

Function URLs are public, and this template doesn't add authentication, so anyone with the URL can call these routes and spend AI Gateway credits. Before you expose the function, check a bearer token in each route or use [Managed Better Auth](https://neon.com/docs/auth/overview).

## Errors

| Status | Meaning |
| --- | --- |
| `400` | The body is not JSON or fails validation. |
| `405` | The method is not `POST`. |
| `502` | The model request failed. |
| `503` | AI Gateway is not enabled. |

`/chat` returns `200` as soon as the stream starts. A model error after that truncates the stream, and the function logs the error.

## Customize

- **Model.** Every module sets `MODEL = "gpt-5-mini"`. You can use any tool-calling model from the [AI Gateway catalog](https://neon.com/docs/ai-gateway/overview#available-models).
- **Chat tool.** Edit `rollDice` in `chat.ts`, or replace it with a tool that reads your own data.
- **Triage agents.** Edit the instructions and `handoffs` in `triage.ts`.
- **Structured output.** Edit `ContactSchema` in `extract.ts`. The module passes the schema as `outputType`, so the SDK validates the final output before it reaches your code.
- **Responses API.** `useResponses: false` keeps every route on Chat Completions, which works with the whole catalog. For Responses-only features, see [OpenAI Responses on AI Gateway](https://neon.com/docs/ai-gateway/openai-responses). Use `/openai/v1` and `useResponses: true`, and check that your model supports the Responses API.
