# MCP server with OAuth sign-in

This template is a [Model Context Protocol](https://modelcontextprotocol.io) server that runs as a [Neon Function](https://neon.com/docs/compute/functions/overview), and MCP clients such as ChatGPT, Claude, Cursor, and VS Code connect to it with OAuth. [Managed Better Auth](https://neon.com/docs/auth/overview) is the OAuth provider through its [OAuth provider plugin](https://neon.com/docs/auth/guides/plugins/oauth-provider), and the function verifies each access token with [`@neon/oauth`](https://github.com/neondatabase/neon-pkgs/tree/main/packages/oauth), so every tool call runs as the signed-in user.

The OAuth provider sends users to a sign-in page and a consent page that you host. This function serves both pages and a sign-up page itself, so you don't need a separate frontend. Agents paint squares on a shared 5 by 5 canvas stored in [Lakebase Postgres](https://neon.com/lakebase), and each square records the user who painted it last.

<Operations>

| Route | Purpose |
| --- | --- |
| `/mcp` | The MCP server over the [streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http). A request without a valid token gets `401` with a link to the metadata route below. |
| `/.well-known/oauth-protected-resource/mcp` | The [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) protected resource metadata, which names the branch's Managed Better Auth issuer. |
| `/auth/sign-in`, `/auth/sign-up` | Email and password sign-in and sign-up pages that resume the authorization request once the user has a session. |
| `/auth/consent` | The consent page, which shows the client name, its website, the host that receives the code, the requested scopes, and the resource before the user allows or denies access. It warns the user when the client returns to `localhost`. |

The MCP server has three tools:

| Tool | Description |
| --- | --- |
| `whoami` | Return the signed-in user's ID with the OAuth client and scopes that the token grants. |
| `view_canvas` | List all 25 squares with their color and the user who painted each one last. |
| `paint_square` | Paint the square at column `x`, `A` through `E`, and row `y`, `1` through `5`, with `white`, `red`, `orange`, `yellow`, `green`, `blue`, `purple`, or `black`, and record the signed-in user as its painter. |

</Operations>

Each tool declares all four [tool annotations](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-annotations): `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint`. ChatGPT and Claude require them before they list a server in their plugin directories.

## Scaffold it

Install the latest Neon CLI, then create the function from the registry in a project that runs in a [region with Neon Functions](https://neon.com/docs/compute/functions/overview):

```bash
npm install -g neon@latest
neon login
neon link
neon functions new mcp-oauth --slug mcpoauth
```

The CLI writes `functions/mcpoauth/index.ts`, declares the function in `neon.ts`, installs its dependencies, and adds `MCP_RESOURCE` to `.env.example`.

## Enable Managed Better Auth

The scaffolded `neon.ts` sets `auth: false`, so change it to `true`:

```ts
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  functions: {
    mcpoauth: {
      name: "MCP server with OAuth sign-in",
      source: "./functions/mcpoauth/index.ts",
      env: { MCP_RESOURCE: process.env.MCP_RESOURCE! },
    },
  },
});
```

With Auth on, Neon injects the OAuth issuer into the function as `NEON_AUTH_BASE_URL`, next to the branch's `DATABASE_URL`.

## Set the MCP server URL

`MCP_RESOURCE` is the public URL of the function's `/mcp` endpoint. The OAuth provider writes it into each access token as the audience claim, `aud`, and the function rejects any token that was issued for a different resource. A function URL has the form `https://<branch_id>-<slug><host suffix>`, and `neon link` already wrote the branch ID and the host suffix to `.env.local`, so you can set the URL before the first deploy:

```bash
BRANCH_ID=$(grep '^NEON_BRANCH_ID=' .env.local | cut -d= -f2)
HOST_SUFFIX=$(grep '^NEON_FUNCTION_HOST_SUFFIX=' .env.local | cut -d= -f2)
FUNCTION_URL="https://${BRANCH_ID}-mcpoauth${HOST_SUFFIX}"
echo "MCP_RESOURCE=${FUNCTION_URL}/mcp" >> .env.local
```

<EnvironmentVariables>

- `MCP_RESOURCE` is the public URL of this function's `/mcp` endpoint, such as `https://<branch_id>-mcpoauth.compute.<cell>.aws.neon.tech/mcp`, and it must match the MCP server URL on the branch's OAuth provider exactly. While it's unset, `/mcp` and the auth pages answer `503` with the name of the missing variable.

</EnvironmentVariables>

## Create the table

The module exports its [Drizzle](https://orm.drizzle.team) schema, so `drizzle-kit push` can create the table on the linked branch. Install drizzle-kit and add this `drizzle.config.ts` next to `neon.ts`:

```bash
npm install -D drizzle-kit
```

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./functions/mcpoauth/index.ts",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED! },
});
```

drizzle-kit loads only `.env`, so pass `.env.local` to it with Node's `--env-file` flag:

```bash
node --env-file=.env.local node_modules/drizzle-kit/bin.cjs push
```

Run the push again on any new branch that doesn't inherit the table from its parent.

## Deploy

```bash
neon deploy --env .env.local
```

`neon deploy` enables Managed Better Auth on the branch, deploys the function, and pulls `NEON_AUTH_BASE_URL` into `.env.local`. The `--env .env.local` flag lets `neon.ts` resolve `MCP_RESOURCE`. The function URL that `neon deploy` prints, which `neon functions get mcpoauth` also shows, should match `FUNCTION_URL`.

## Turn on the OAuth provider

Add the function's origin as a trusted domain, then point the OAuth provider at the function's pages and its `/mcp` endpoint:

```bash
neon neon-auth domain add "$FUNCTION_URL"

neon neon-auth config oauth-server update --enabled \
  --login-page "$FUNCTION_URL/auth/sign-in" \
  --consent-page "$FUNCTION_URL/auth/consent" \
  --mcp-resource "$FUNCTION_URL/mcp" \
  --mcp-client-id-metadata-documents

neon neon-auth config oauth-server get
```

MCP clients identify themselves with a [client ID metadata document](https://neon.com/docs/auth/guides/plugins/oauth-provider#client-id-metadata-documents), which ChatGPT, Claude, and VS Code support, so you don't have to create an OAuth client for each one. Leave [dynamic client registration](https://neon.com/docs/auth/guides/plugins/oauth-provider#dynamic-client-registration-legacy) off unless a client you need can't use a metadata document. The Neon Console has the same settings under **Settings** > **Better Auth** > **OAuth provider**.

To check the server, call `/mcp` without a token and read the metadata it points to. The `authorization_servers` entry must equal `NEON_AUTH_BASE_URL`:

```bash
curl -i "$FUNCTION_URL/mcp"
# HTTP/2 401
# www-authenticate: Bearer error="invalid_token", ..., resource_metadata="https://<function-host>/.well-known/oauth-protected-resource/mcp"

curl "$FUNCTION_URL/.well-known/oauth-protected-resource/mcp"
# {"resource":"https://<function-host>/mcp","authorization_servers":["https://ep-...neonauth.../neondb/auth"]}
```

## Connect an MCP client

Add `https://<function-host>/mcp` to any client that supports OAuth and streamable HTTP. The client opens `/auth/sign-in`, where a new user follows the link to `/auth/sign-up`. After the user approves the client on `/auth/consent`, the client receives an access token that lasts one hour, and it also receives a refresh token when it requested the `offline_access` scope.

In ChatGPT, add the server URL as a new plugin. After the OAuth flow, allow write tools in the connector's settings, because `paint_square` fails without that permission even though the read-only tools work. ChatGPT caches the tool list, so start a new chat after you change the tools.

For Cursor, VS Code, Claude Code, and other clients, [`add-mcp`](https://add-mcp.com) writes the client config with a command such as `npx add-mcp "$FUNCTION_URL/mcp" --name mcp-oauth -a cursor`.

[MCP Inspector](https://github.com/modelcontextprotocol/inspector) and [MCPJam](https://www.mcpjam.com) run the OAuth flow and call the tools interactively, and [Manufact](https://manufact.com) checks a server against the ChatGPT and Claude directory requirements.

Once a client is connected, ask its agent to paint `A1` red and `C2` blue and then show the canvas.

## Run locally

```bash
neon dev
```

`neon dev` serves the function at `http://localhost:8787` with the branch's `DATABASE_URL` and `NEON_AUTH_BASE_URL`. With the deployed `MCP_RESOURCE` in `.env.local`, the local `/mcp` endpoint and its metadata answer the same way as the deployed function:

```bash
curl http://localhost:8787/
# MCP server with OAuth. Connect an MCP client to /mcp; it signs you in through /auth/sign-in and /auth/consent.

curl -i http://localhost:8787/mcp
# HTTP/1.1 401 Unauthorized
```

To run the whole OAuth flow against `localhost`, point the branch's OAuth provider at the local pages and use the local URL as the resource. `http://localhost` stays a trusted domain while [localhost access](https://neon.com/docs/auth/guides/configure-domains#localhost-is-pre-configured) is on, and it's on by default:

```bash
neon neon-auth config oauth-server update \
  --login-page http://localhost:8787/auth/sign-in \
  --consent-page http://localhost:8787/auth/consent \
  --mcp-resource http://localhost:8787/mcp

MCP_RESOURCE=http://localhost:8787/mcp neon dev
```

A branch has one MCP server URL, so remote clients can't connect to the deployed function until you run the `oauth-server update` command from [Turn on the OAuth provider](#turn-on-the-oauth-provider) again. Do this on a development branch that you create with `neon checkout --create dev`.

## Branches

Each branch has its own issuer, function URL, trusted domains, and OAuth provider settings. A new child branch copies its parent's OAuth provider settings, so they still point at the parent's function. Because `@neon/oauth` checks the exact issuer, the function on one branch rejects tokens that another branch issued. After `neon checkout --create <name>`, repeat [Set the MCP server URL](#set-the-mcp-server-url) to write the new branch's URL to `.env.local`, deploy, and run the commands in [Turn on the OAuth provider](#turn-on-the-oauth-provider) for that branch.

## Data model

The module defines one Drizzle table, `mcp_canvas_squares`, and every query goes through Drizzle's query builder, which sends each value as a bound parameter:

| Column | Type |
| --- | --- |
| `x` | `mcp_canvas_column` enum with the values `A` through `E` |
| `y` | `smallint`, and the tool accepts `1` through `5` |
| `color` | `mcp_canvas_color` enum with the values `white`, `red`, `orange`, `yellow`, `green`, `blue`, `purple`, and `black` |
| `painted_by` | `text` with the ID of the user who painted the square last |
| `updated_at` | `timestamptz` that defaults to `now()` |

The primary key is `x` and `y` together, so painting a square again updates its row, and a square that nobody has painted has no row and reads as white. `painted_by` holds the access token's `sub` claim, which is the Managed Better Auth user ID, and the tools always take that ID from the verified token instead of from tool input.

To give each user their own data instead of a shared canvas, add a `user_id` column and filter every query on it, as [Build an MCP server with Managed Better Auth](https://neon.com/docs/compute/functions/mcp-server) shows.
