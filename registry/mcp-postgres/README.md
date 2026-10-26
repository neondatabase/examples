# MCP server backed by Postgres

A [Model Context Protocol](https://modelcontextprotocol.io) server that runs as a Neon Function. It uses [Hono](https://hono.dev) and the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) to serve streamable HTTP at `/mcp`, and stores a todo list in [Lakebase Postgres](https://neon.com/lakebase) through a pooled `pg` connection registered with `attachDatabasePool` from `@neon/functions`.

The server exposes four tools:

| Tool | Description |
| --- | --- |
| `create_todo` | Insert a todo. `title` is required; `notes` is optional. |
| `list_todos` | Filter by completion and search the title or notes. Omit filters to list todos. `limit` defaults to 20 and caps at 50. |
| `update_todo` | Update the fields you pass for a todo `id`, including `completed`. Title and notes cannot be cleared. |
| `delete_todo` | Delete a todo by `id` and return the deleted row. |

Every request to `/mcp` must send `Authorization: Bearer <MCP_API_KEY>`.

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new mcp-postgres --slug mcppostgres
```

The CLI writes `functions/mcppostgres/index.ts`, declares the function in `neon.ts`, and adds `MCP_API_KEY` to `.env.example`.

`neon.ts` points the function at the module and passes the API key through as a function env variable:

```ts
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  functions: {
    mcppostgres: {
      name: "MCP server backed by Postgres",
      source: "./functions/mcppostgres/index.ts",
      env: { MCP_API_KEY: process.env.MCP_API_KEY! },
    },
  },
});
```

The function reads `DATABASE_URL` from the linked branch, so run `neon link` before you start or deploy it.

## Set the API key

Generate a token and store it in `.env.local`:

```bash
export MCP_API_KEY="$(openssl rand -hex 32)"
printf 'MCP_API_KEY=%s\n' "$MCP_API_KEY" >> .env.local
```

`neon dev` loads `.env.local`; `neon deploy` needs `--env .env.local` to resolve the value while evaluating `neon.ts`. A missing key and a wrong key both return 401, so if every request fails, check that `MCP_API_KEY` was set in the environment you deployed with.

## Run locally

```bash
neon dev
```

`neon dev` serves every function declared in `neon.ts` and prints its URL (the default is `http://localhost:8787`). The MCP endpoint is `/mcp`:

```bash
curl http://localhost:8787/
# MCP server. Connect an MCP client to /mcp with an Authorization: Bearer token.

curl -i http://localhost:8787/mcp
# HTTP/1.1 401 Unauthorized
```

## Connect an MCP client

Any client that speaks the streamable HTTP transport can connect to `/mcp` and send the bearer token. For example, with [`mcporter`](https://github.com/openclaw/mcporter):

```bash
npm install -g mcporter

mcporter list http://localhost:8787/mcp --schema --allow-http \
  --header "Authorization=Bearer $MCP_API_KEY"

mcporter call "http://localhost:8787/mcp.create_todo" --allow-http \
  --header "Authorization=Bearer $MCP_API_KEY" \
  title="Write the rollback notes" notes="Include the migration step"
```

`--allow-http` is only needed for local plain-HTTP URLs. To write the config for Cursor, Claude Code, or another supported client instead, use [`add-mcp`](https://add-mcp.com):

```bash
npx add-mcp http://localhost:8787/mcp \
  --header "Authorization: Bearer $MCP_API_KEY" \
  --name mcp-postgres -a cursor -g
```

`add-mcp` writes the token into the client config. `-g` keeps that file in your user directory instead of the project, so the secret does not land in git.

## Deploy

```bash
neon deploy --env .env.local
```

`--env .env.local` lets `neon.ts` resolve `MCP_API_KEY` before deployment. Get the deployed invocation URL:

```bash
neon functions get mcppostgres
```

Then connect a client to `https://<function-url>/mcp` with the same bearer token, or install it with `add-mcp`:

```bash
npx add-mcp https://<function-url>/mcp \
  --header "Authorization: Bearer $MCP_API_KEY" \
  --name mcp-postgres -a cursor -g
```

A Neon Function URL is public. This template gates `/mcp` with a static bearer token.

## Data model

The first tool call creates the table, so there is no migration step. A single cached promise runs the `CREATE TABLE IF NOT EXISTS` once per function instance:

```sql
CREATE TABLE IF NOT EXISTS mcp_todos (
  id serial PRIMARY KEY,
  title text NOT NULL,
  notes text,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```