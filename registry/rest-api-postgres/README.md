# REST API with Hono and Postgres

A CRUD REST API for a `todos` table, running as a [Neon Function](https://neon.com/docs/compute/functions/overview) on long-lived Node.js compute next to your database.

- [Hono](https://hono.dev) handles routing and JSON responses.
- [`pg`](https://node-postgres.com) queries Lakebase Postgres through a connection pool.
- `DATABASE_URL` is injected from the linked branch by Neon; there is nothing to configure.

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new rest-api-postgres --slug todos
```

The CLI writes `functions/todos/index.ts`, declares `todos` in `neon.ts`, and installs the template's dependencies.

`neon link` pulls `DATABASE_URL` into `.env.local`. You can also find the connection string in the [Neon Console](https://console.neon.tech).

## Run locally

```bash
neon dev
```

Call the URL that `neon dev` prints (the default is `http://localhost:8787/`). The first request to a `/todos` route creates the table if it does not exist.

```bash
# Describe the API
curl http://localhost:8787/

# Create a todo
curl -X POST http://localhost:8787/todos \
  -H 'content-type: application/json' \
  -d '{"title":"ship it"}'

# List todos
curl http://localhost:8787/todos

# Complete a todo
curl -X PATCH http://localhost:8787/todos/1 \
  -H 'content-type: application/json' \
  -d '{"completed":true}'

# Delete a todo
curl -X DELETE http://localhost:8787/todos/1
```

## Routes

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/` | — | The API name and route list |
| `GET` | `/todos` | — | Up to 100 todos, newest first |
| `POST` | `/todos` | `{ "title": string, "completed"?: boolean }` | `201` with the created todo |
| `GET` | `/todos/:id` | — | The todo, or `404` |
| `PATCH` | `/todos/:id` | `{ "title"?: string, "completed"?: boolean }` | The updated todo, or `404` |
| `DELETE` | `/todos/:id` | — | `204`, or `404` |

A non-numeric `:id`, a body that isn't a JSON object, an empty `title`, or a non-boolean `completed` returns `400`. Any other path or method returns `404`.

## Deploy

```bash
neon deploy
neon functions get todos
```

`neon functions new` declares the function in `neon.ts`, and `neon deploy` (an alias for `neon config apply`) deploys everything declared there. If you scaffolded with `--no-add-to-config`, deploy the function directly instead:

```bash
neon functions deploy todos --src functions/todos
```

`neon functions get` prints the function's public URL. Call the same routes there:

```bash
curl https://<branch-id>-todos.compute.<cell>.<region>.aws.neon.tech/todos
```

> [!NOTE]
> For production schema changes, use a migration tool like [Drizzle ORM](https://neon.com/docs/guides/drizzle) or [Prisma](https://neon.com/docs/guides/prisma).

