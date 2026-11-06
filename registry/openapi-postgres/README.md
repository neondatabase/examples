# CRUD API with OpenAPI and Postgres

A CRUD API for a `bookmarks` table, running as a [Neon Function](https://neon.com/docs/compute/functions/overview) on long-lived Node.js compute next to your database.

- [Hono](https://hono.dev) handles routing and JSON responses.
- [`@hono/zod-openapi`](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) defines each route with Zod, validates the request, and generates the OpenAPI document.
- Swagger UI serves that document at `/docs`.
- [`pg`](https://node-postgres.com) queries Lakebase Postgres through a connection pool.
- `DATABASE_URL` is injected from the linked branch. Writes need a bearer token; reads are open.

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new openapi-postgres --slug bookmarks
```

The CLI writes `functions/bookmarks/index.ts`, declares `bookmarks` in `neon.ts`, and installs the template's dependencies.

`neon link` pulls `DATABASE_URL` into `.env.local`. You can also find the connection string in the [Neon Console](https://console.neon.tech).

## Set the API token

Function URLs are public, so `POST`, `PATCH`, and `DELETE` require a bearer token. `GET` routes, `/openapi.json`, and `/docs` stay open.

<EnvironmentVariables>

- `BOOKMARKS_API_TOKEN`: A random token of at least 32 characters, for example from `openssl rand -hex 32`, that callers send as `Authorization: Bearer <token>` on writes. Without it, writes return `503`.

</EnvironmentVariables>

```bash
printf 'BOOKMARKS_API_TOKEN=%s\n' "$(openssl rand -hex 32)" >> .env.local
export BOOKMARKS_API_TOKEN=$(grep '^BOOKMARKS_API_TOKEN=' .env.local | cut -d= -f2-)
```

## Run locally

```bash
neon dev
```

Call the URL that `neon dev` prints. The examples below use `$URL` for that URL. The first valid request to a `/bookmarks` route creates the table and its tag index.

```bash
# Create a bookmark
curl -X POST "$URL/bookmarks" \
  -H "authorization: Bearer $BOOKMARKS_API_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"url":"https://neon.com/docs","title":"Neon documentation","tags":["postgres"]}'

# List bookmarks, optionally filtered by tag
curl "$URL/bookmarks?tag=postgres&limit=10"

# Read one
curl "$URL/bookmarks/1"

# Update the title or tags
curl -X PATCH "$URL/bookmarks/1" \
  -H "authorization: Bearer $BOOKMARKS_API_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"tags":["postgres","docs"]}'

# Delete one
curl -X DELETE "$URL/bookmarks/1" \
  -H "authorization: Bearer $BOOKMARKS_API_TOKEN"
```

A created bookmark looks like this:

```json
{
  "id": 1,
  "url": "https://neon.com/docs",
  "title": "Neon documentation",
  "tags": ["postgres"],
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

## OpenAPI docs

Open `$URL/docs` in a browser, or fetch the generated document:

```bash
curl "$URL/openapi.json"
```

`GET /` redirects to `/docs`. The document is OpenAPI 3.1 and includes the `bookmarks` schema, the routes, and the `tag` and `limit` query parameters.

## Routes

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/` | — | `302` to `/docs` |
| `GET` | `/bookmarks` | — | Up to `limit` bookmarks, newest first |
| `POST` | `/bookmarks` | `{ "url": string, "title": string, "tags"?: string[] }` | `201` with the created bookmark |
| `GET` | `/bookmarks/{id}` | — | The bookmark, or `404` |
| `PATCH` | `/bookmarks/{id}` | `{ "title"?: string, "tags"?: string[] }` | The updated bookmark, or `404` |
| `DELETE` | `/bookmarks/{id}` | — | `204`, or `404` |
| `GET` | `/openapi.json` | — | The generated OpenAPI 3.1 document |
| `GET` | `/docs` | — | Swagger UI |

`GET /bookmarks` accepts `tag` (one tag to match) and `limit` (1-100, default 50).
`PATCH` requires at least one of `title` or `tags`. Routes use `{id}` in the OpenAPI
document; call them with a numeric id.

## Deploy

```bash
neon deploy --env .env.local
neon functions get bookmarks
```

`--env .env.local` lets `neon.ts` resolve `BOOKMARKS_API_TOKEN` before deployment.

## How it works

Each route is a `createRoute({...})` definition plus an `app.openapi(route, handler)` call. The Zod schema validates the request and becomes the OpenAPI parameter, body, or response schema, so the code and the document cannot drift apart. `app.doc31` serves the generated document.

The module creates `bookmarks` and a GIN index on `tags` on the first valid request. For production schema changes, use a migration tool like [Drizzle ORM](https://neon.com/docs/guides/drizzle) or [Prisma](https://neon.com/docs/guides/prisma) instead of `ensureSchema`.

## Errors

| Status | Meaning |
| --- | --- |
| `400` | The query, path, or body fails Zod validation, or `PATCH` has neither `title` nor `tags`. |
| `401` | A write was sent without the right `Authorization: Bearer` token. |
| `404` | No bookmark has that id, or the path is unknown. |
| `415` | A request body was sent without `Content-Type: application/json`. |
| `500` | The database query failed. The function logs the cause. |
| `503` | A write was sent but `BOOKMARKS_API_TOKEN` is unset or shorter than 32 characters. |

## Notes

- Writes use one shared bearer token. For per-user access, use
  [Neon Auth](https://neon.com/docs/auth/overview) instead. In Swagger UI, select **Authorize** and paste the token to try the write routes.
- It also adds no CORS middleware. Add Hono's [`cors`](https://hono.dev/docs/middleware/builtin/cors) if a browser on another origin calls the API.
- Swagger UI loads version 5.34.1 of its assets from a CDN. `/openapi.json` works even when the CDN is unavailable.
