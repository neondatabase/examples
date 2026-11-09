# MCP server with mcp-use

Built by [Manufact](https://manufact.com/), this template shows how to run a [Model Context Protocol](https://modelcontextprotocol.io) server on Neon Functions. It uses [mcp-use](https://github.com/mcp-use/mcp-use) for streamable HTTP at `/mcp` and a shared `pg` pool registered with `attachDatabasePool` for Lakebase Postgres.

The example tools create, update, delete, and search events in Postgres. Adapt them to your own use case.

## Tools

All four tools share one MCP endpoint and database table:

| Tool            | Inputs and behavior                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_event`  | Requires `title` and `startsAt`. Optional `location`, `description`, and `url`. Returns the created event.                                                                                      |
| `update_event`  | Requires `id`. Changes only supplied fields; returns an error if no fields are supplied or the event is missing. Optional text fields cannot be cleared.                                        |
| `delete_event`  | Deletes an event by `id` and returns it; returns an error if it is missing.                                                                                                                     |
| `search_events` | Searches `title`, `location`, and `description` case-insensitively. Optional `from` (inclusive) and `to` (exclusive). Results sort by start time, then ID. `limit` defaults to 20, maximum 100. |

Times must be ISO 8601 strings with `Z` or an explicit UTC offset, such as `2026-11-20T18:00:00-08:00`. Postgres stores the instant as `timestamptz`; responses serialize dates in UTC. If both search bounds are provided, `from` must precede `to`.

## Scaffold

Use a Neon project in a region that supports Functions. In your project directory:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new mcp-use --slug mcpuse -y
```

The CLI copies `functions/mcpuse/index.ts`, installs the pinned dependencies, and declares the function in `neon.ts`. It also adds the custom variable to `.env.example`. Neon injects `DATABASE_URL` from the linked branch automatically.

## Configuration

<EnvironmentVariables>

| Variable      | Description                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_API_KEY` | Random token of at least 32 characters, for example from `openssl rand -hex 32`. Every request must send `Authorization: Bearer <token>` because the function URL is public. |

</EnvironmentVariables>

Append a new token to the `.env.local` file created by `neon link`, preserving `DATABASE_URL`:

```bash
export MCP_API_KEY="$(openssl rand -hex 32)"
printf 'MCP_API_KEY=%s\n' "$MCP_API_KEY" >> .env.local
```

The generated function configuration passes the token into the handler:

```ts
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
	functions: {
		mcpuse: {
			name: "MCP server with mcp-use",
			source: "./functions/mcpuse/index.ts",
			env: { MCP_API_KEY: process.env.MCP_API_KEY! },
		},
	},
});
```

All callers with this shared key can read, edit, and delete all events. A missing server key or a missing or incorrect bearer token returns HTTP 401 before the MCP handler runs.

## Run locally

```bash
neon dev
```

Use the URL printed by `neon dev` (shown here as `http://localhost:8787`). In another terminal, set `MCP_API_KEY` to the same token and connect with the mcp-use client CLI:

```bash
npx mcp-use client connect neon-example http://localhost:8787/mcp \
  -H "Authorization: Bearer $MCP_API_KEY" \
  --no-oauth
npx mcp-use client neon-example tools list
```

Create an event, then search for it:

```bash
npx mcp-use client neon-example tools call create_event \
  '{"title":"Product demo","startsAt":"2026-11-20T18:00:00-08:00","location":"Online"}'
npx mcp-use client neon-example tools call search_events \
  '{"query":"Product demo"}'
```

Remove the saved client connection when finished:

```bash
npx mcp-use client remove neon-example
```

Connect any MCP client that supports streamable HTTP and custom headers to `/mcp` with `Authorization: Bearer <MCP_API_KEY>`. Authentication covers every route, including the root information page.

## Deploy

```bash
neon deploy --env .env.local
neon functions get mcpuse
```

Pass `--env .env.local` so `neon.ts` can resolve the custom key during deployment. Connect your client to the returned function URL with `/mcp` appended and the same bearer token.

## Storage

The table contains `id`, `title`, `starts_at`, `location`, `description`, `url`, `created_at`, and `updated_at`. The first tool call runs `CREATE TABLE IF NOT EXISTS`; the database role must be able to create this table. Initialization is shared within a function instance, and a failed initialization is retried on the next tool call. Existing tables are not migrated automatically.
