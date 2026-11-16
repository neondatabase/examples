# Fact-checking agent with Google ADK

This Neon Function runs an agent built with the [Google Agent Development Kit (ADK)](https://google.github.io/adk-docs/) to fact-check claims using Google Search. It returns a verdict, a supporting explanation, and the sources used to reach its conclusion. All model calls are routed through [Neon AI Gateway](https://neon.com/docs/ai-gateway/overview), which also provides the `google_search` tool, enabling the agent to ground its responses in real-time search results.

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new google-adk --slug factcheck
```

The CLI writes `functions/factcheck/index.ts` and declares the function in `neon.ts`.

Enable AI Gateway for the project:

```bash
neon config add ai-gateway
```

You can also set `aiGateway: true` in `neon.ts`.

AI Gateway requires prepaid credits (available on any Neon plan, including Free) and a project in a supported region. See the [AI Gateway quickstart](https://neon.com/docs/ai-gateway/get-started).

Deploy once so Neon provisions the gateway and pulls `NEON_AI_GATEWAY_BASE_URL` and `NEON_AI_GATEWAY_TOKEN` into your env file (`.env.local` when the project has no `.env`):

```bash
neon deploy
```

## Run locally

```bash
neon dev
```

`neon dev` loads your env files, injects the branch's AI Gateway credentials, and prints the URL to call. The example below uses `$URL` for that URL.

```bash
curl -X POST "$URL/" \
  -H "Content-Type: application/json" \
  -d '{"claim":"The Eiffel Tower is 330 metres tall."}'
```

Example response:

```json
{
  "reply": "TRUE\n\nAs of March 15, 2022, the Eiffel Tower is 330 metres (1,083 feet) tall, including the digital radio antenna added at the summit that day. The iron structure itself is about 300 metres.",
  "verdict": "TRUE",
  "queries": [
    "current height of Eiffel Tower",
    "Eiffel Tower height 330 meters"
  ],
  "sources": [
    {
      "uri": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/...",
      "title": "eiffeltowertravel.com"
    }
  ],
  "searchEntryPoint": {
    "renderedContent": "<div class=\"container\">…</div>"
  },
  "model": "gemini-3-flash"
}
```

`verdict` is present when the first line of `reply` is one of the four verdicts. `searchEntryPoint` is present when Google returns Search suggestions. Both fields are omitted otherwise.

## Deploy

`neon functions get factcheck` prints the deployed function's public URL. It takes the same request as the dev server:

```bash
curl -X POST "https://<function-url>/" \
  -H "Content-Type: application/json" \
  -d '{"claim":"The Eiffel Tower is 330 metres tall."}'
```

> Replace `<function-url>` with the URL from `neon functions get factcheck`.

## Request format

Send `POST /` with a JSON body holding one `claim` string of 1-2000 characters:

```json
{ "claim": "The Eiffel Tower is 330 metres tall." }
```

| Status | Meaning |
| --- | --- |
| `400` | The body is not JSON or `claim` is missing or too long. |
| `405` | The method is not `POST`. |
| `429` | AI Gateway rate limit reached. |
| `502` | The model request failed, the agent returned no answer, or AI Gateway rejected the credentials. |
| `503` | AI Gateway is not enabled. |

The reply is plain text, so the first line is the agent's verdict and the rest is its explanation. Use `verdict` when it is set; otherwise read the first line of `reply`. Show `sources` as citations. The model decides whether to search, so a claim it answers without searching comes back with empty `sources` and `queries`.

`sources[].title` is the page or site name (often just the domain), so use it for display. `sources[].uri` is a Google redirect URL, not the site's address; follow it server-side if you need the real link.

When `searchEntryPoint` is present, it holds the HTML/CSS for Google Search suggestions. This template doesn't authenticate requests, so anyone with the function URL can call it and spend AI Gateway credits. Add authentication before you expose it.

## How it works

The scaffolded module defines an `LlmAgent` with the built-in `GOOGLE_SEARCH` tool and runs it with `InMemoryRunner` for each request. Search runs inside the model call on Google's side, and the agent's grounding metadata comes back with the search queries, source chunks, and Search suggestions Google returned.

ADK's `Gemini` model doesn't accept a base URL, so the module subclasses it and overrides `getHttpOptions()` to point the client at `${NEON_AI_GATEWAY_BASE_URL}/gemini` with API version `v1beta`. That is the same Gemini endpoint the [`google-genai` SDK uses through the gateway](https://neon.com/docs/ai-gateway/gemini).

## Customize

- **Model.** `MODEL` in the scaffolded module is `gemini-3-flash`. Any Gemini model on the [AI Gateway catalog](https://neon.com/docs/ai-gateway/overview#available-models) that supports search grounding works.
- **Prompt.** `INSTRUCTION` sets the verdict format. Change it to ask for the fields or tone your app needs.
- **More tools.** Add function tools to the agent with `FunctionTool` and a Zod schema (install `zod`), next to `GOOGLE_SEARCH`.
- **Structured verdicts.** For a typed response, give the agent an `outputSchema` (install `zod` for the schema) and parse `reply` as JSON. ADK implements this with a `set_model_response` tool, so check that your model still returns grounding metadata in this mode; if it doesn't, `sources` stays empty.
- **Sessions.** `InMemoryRunner` keeps nothing between requests. For multi-turn conversations, use `Runner` with the `DatabaseSessionService` from `@google/adk/sessions/database` and the Postgres driver it needs (`@mikro-orm/postgresql`).
