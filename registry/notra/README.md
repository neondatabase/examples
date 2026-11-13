# AI search visibility with Notra

This Neon Function runs AI visibility scans and reads their results through [Notra](https://www.usenotra.com). Notra asks ChatGPT, Perplexity, Gemini, Google AI Mode and other AI engines the questions your buyers ask, and tracks how often each answer mentions your brand, at what position, and next to which competitors.

<Operations>

| Route | Default | What it does |
| --- | --- | --- |
| `POST /projects` | yes | Lists your Notra projects and their ids. Every other route takes a `projectId`. |
| `POST /scan` | yes | `{ projectId }` starts a scan of every tracked prompt on every engine of the project and returns a `scanId`. |
| `POST /scan-status` | yes | `{ projectId, scanId }` returns the scan's `status` (`running`, `completed` or `failed`) and mentions per engine. |
| `POST /visibility` | yes | `{ projectId, days? }` returns mention rate, citations and average position per engine over the last `days` (1-365, default 30). |
| `POST /competitor-share` | no | `{ projectId, days? }` returns how often each brand is mentioned in the answers. |
| `POST /content-gaps` | no | `{ projectId }` lists prompts where competitors are mentioned and you are not, ranked by opportunity. |
| `POST /agent-readiness` | no | `{ projectId }` returns how well AI agents can read and use your site. Add `"rescan": true` to start a new check. |

</Operations>

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new notra
```

The CLI asks which routes to include, and `--all-operations` includes every route. It writes the modules and a router `index.ts` to `functions/notra/`, declares the function in `neon.ts`, and adds the two environment variables to `.env.example`.

## Configure Notra

[Sign up for Notra](https://app.usenotra.com), add your brand as a project, and create an API key on the **API Keys** page. Give the key the scopes of the routes you scaffold:

| Route | Scope |
| --- | --- |
| `/projects` | `projects.read` |
| `/scan`, `/scan-status` | `scans.write`, `scans.read` |
| `/visibility`, `/competitor-share` | `visibility.read` |
| `/content-gaps` | `briefs.read` |
| `/agent-readiness` | `agent-readiness.read`, plus `agent-readiness.write` for `rescan` |

Function URLs are public, so every route also requires a bearer token you choose. Add both to `.env.local` without replacing the Neon values already there:

```bash
echo "NOTRA_API_KEY=ntra_..." >> .env.local
export NOTRA_FUNCTION_TOKEN=$(openssl rand -hex 32)
echo "NOTRA_FUNCTION_TOKEN=$NOTRA_FUNCTION_TOKEN" >> .env.local
```

<EnvironmentVariables>

- `NOTRA_API_KEY`: A Notra API key with the scopes of the routes you use. Keep it server-side.
- `NOTRA_FUNCTION_TOKEN`: A random token of at least 32 characters that callers send as `Authorization: Bearer <token>`. Neon Function URLs are public, so the function requires it.

</EnvironmentVariables>

## Run locally

```bash
neon dev
```

Call the URL that `neon dev` prints (the default is `http://localhost:8787/`). Find your project id:

```bash
curl -s http://localhost:8787/projects \
  -H "authorization: Bearer $NOTRA_FUNCTION_TOKEN" -X POST
```

Start a scan, then check on it until `status` is no longer `running`. A scan takes a few minutes:

```bash
curl -s http://localhost:8787/scan \
  -H "authorization: Bearer $NOTRA_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"projectId":"<projectId>"}'

curl -s http://localhost:8787/scan-status \
  -H "authorization: Bearer $NOTRA_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"projectId":"<projectId>","scanId":"<scanId>"}'
```

Read the result per engine:

```bash
curl -s http://localhost:8787/visibility \
  -H "authorization: Bearer $NOTRA_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"projectId":"<projectId>","days":7}'
```

The response looks like this, with one entry per engine:

```json
{
  "configured": true,
  "engines": [
    {
      "engine": "chatgpt",
      "checks": 40,
      "mentions": 26,
      "mentionRate": 0.65,
      "citations": 11,
      "visibility": 29,
      "visibilityRate": 0.725,
      "avgPosition": 2.1,
      "lastCheckedAt": "2026-11-13T07:00:12.000Z"
    }
  ]
}
```

- `mentions` counts answers that name your brand, and `citations` answers that cite your site.
- `visibility` counts answers that do either, so it is at least `mentions`.
- `avgPosition` is where your brand lands among the products an answer lists, where 1 is first.

The routes return Notra's response without its `organization` field. `/scan` returns only `{ scanId }`.

## Deploy

```bash
neon deploy --env .env.local
neon functions get notra
```

`neon functions get` prints the function's public URL. Call it the same way as locally, with the bearer token.

To scan on a schedule, add a [Function Trigger](https://neon.com/docs/compute/functions/triggers/overview) that calls `/scan`, or let Notra run its own scheduled scans and read them with `/visibility`.

## Errors

| Status | Meaning |
| --- | --- |
| `400` | The body is not JSON or fails validation. |
| `401` | The bearer token is missing or wrong. |
| `402` | The Notra plan or AI credits do not cover a scan. |
| `404` | The project or scan does not exist, or the project has no agent readiness report yet. |
| `405` | The method is not `POST`. |
| `409` | A scan for this project is still running. |
| `429` | Notra rate limit reached. |
| `502` | Notra rejected `NOTRA_API_KEY`, the key lacks the route's scope, or the request failed. |
| `503` | `NOTRA_API_KEY` is unset, or `NOTRA_FUNCTION_TOKEN` is unset or shorter than 32 characters. |

Errors from Notra include its `code` and `requestId`.
