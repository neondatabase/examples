# Context.dev web data

This Neon Function searches the web and news, reads pages, answers questions, and retrieves brand data through [Context.dev](https://www.context.dev/).

<Operations>

| Route | Default | What it does |
| --- | --- | --- |
| `POST /web-search` | yes | `{ query, numResults? }` finds current source URLs. `numResults` is 1-10 (default 10). |
| `POST /web-scrape` | yes | `{ url }` returns up to 50,000 characters of Markdown and source metadata for an HTTP(S) page. |
| `POST /web-answers` | no | `{ task, mode? }` returns a sourced answer. `mode` is `fast` (the default) or `ultra`. |
| `POST /brand-retrieve` | no | `{ domain }` returns company identity, logo, colors, and social links. |
| `POST /news-search` | no | `{ query }` or `{ domain }`, plus optional `limit` (1-10) and `cursor`, finds news articles. Pass the returned cursor for the next page. |

</Operations>

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new context-dev
```

The CLI asks which routes to include, and `--all-operations` includes every route. It writes the modules and a router `index.ts` to `functions/contextdev/`, declares the function in `neon.ts`, and adds the two environment variables to `.env.example`.

## Configure Context.dev

Create a Context.dev API key with `data:execute` access. Function URLs are public, so every route also requires a bearer token you choose. Add both to `.env.local` without replacing the Neon values already there:

```bash
echo "CONTEXT_DEV_API_KEY=..." >> .env.local
export CONTEXT_FUNCTION_TOKEN=$(openssl rand -hex 32)
echo "CONTEXT_FUNCTION_TOKEN=$CONTEXT_FUNCTION_TOKEN" >> .env.local
```

<EnvironmentVariables>

- `CONTEXT_DEV_API_KEY`: A Context.dev API key with `data:execute` access. Keep it server-side.
- `CONTEXT_FUNCTION_TOKEN`: A random token of at least 32 characters that callers send as `Authorization: Bearer <token>`. Neon Function URLs are public, so the function requires it.

</EnvironmentVariables>

## Run locally

```bash
neon dev
```

Call the URL that `neon dev` prints (the default is `http://localhost:8787/`). Search the web:

```bash
curl -s http://localhost:8787/web-search \
  -H "authorization: Bearer $CONTEXT_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"query":"Neon serverless Postgres branching","numResults":3}'
```

Read a page as Markdown:

```bash
curl -s http://localhost:8787/web-scrape \
  -H "authorization: Bearer $CONTEXT_FUNCTION_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"url":"https://neon.com/docs/introduction"}'
```

`/web-scrape` returns `{ url, markdown, isTruncated, metadata, request_id }`, and `isTruncated` is `true` when the page was longer than 50,000 characters. The other routes return Context.dev's response unchanged.

## Deploy

```bash
neon deploy --env .env.local
neon functions get contextdev
```

`neon functions get` prints the function's public URL. Call it the same way as locally, with the bearer token.

## Errors

| Status | Meaning |
| --- | --- |
| `400` | The body is not JSON or fails validation. |
| `401` | The bearer token is missing or wrong. |
| `402` | Context.dev credits are exhausted. |
| `405` | The method is not `POST`. |
| `429` | Context.dev rate limit reached. |
| `502` | Context.dev rejected `CONTEXT_DEV_API_KEY`, could not read the page, or the request failed. |
| `503` | `CONTEXT_DEV_API_KEY` is unset, or `CONTEXT_FUNCTION_TOKEN` is unset or shorter than 32 characters. |

The function passes other Context.dev errors through with their status, `error_code`, and `request_id`.
