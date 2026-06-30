<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and MCP

A minimal [Model Context Protocol](https://modelcontextprotocol.io) server that gives an AI agent CRUD access to a contact-management database. Built with the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [Hono](https://hono.dev) (via [`@hono/mcp`](https://github.com/honojs/middleware/tree/main/packages/mcp)), [Neon](https://neon.com) Postgres, and [Drizzle ORM](https://orm.drizzle.team) — deployed as a Neon Function.

The server exposes four tools over the streamable HTTP transport:

| Tool              | Description                                                          |
| ----------------- | ------------------------------------------------------------------- |
| `create_contact`  | Create a contact (`name` required; `email`/`phone`/`company`/`notes` optional). |
| `update_contact`  | Update an existing contact by `id` (only the fields you pass change). |
| `delete_contact`  | Delete a contact by `id`.                                           |
| `search_contacts` | Case-insensitive search across name/email/company/notes; omit the query to list all. |

## Project structure

```
with-mcp/
├── neon.ts             # Neon Functions policy (defineConfig) — what gets deployed
├── drizzle.config.ts   # Drizzle Kit config (schema location + DB credentials)
├── tsconfig.json
├── .env.example        # Required environment variables
├── src/
│   ├── index.ts        # Hono app: MCP server + tools + db client (the function entry)
│   └── db/
│       └── schema.ts   # Drizzle schema (contacts table)
└── package.json
```

## Clone the repository

```bash
npx degit neondatabase/examples/with-mcp ./with-mcp
cd with-mcp
```

## Install and authenticate the Neon CLI

```bash
npm i -g neon
neon login
```

## Install dependencies

```bash
npm install
```

## Link your Neon project

Link (or create) a Neon project by running the `link` command from the workspace root:

```bash
neon link
```

If you let your agent drive this, add `--agent` to skip interactive mode.

`neon link` pulls your branch-scoped environment variables — including `DATABASE_URL` — into `.env.local`. You can also find your connection string in the [Neon Console](https://console.neon.tech).

## Apply the schema

Push the Drizzle schema to your Neon database:

```bash
npm run db:push
```

## Run locally

```bash
neon dev
```

This serves the function at `http://localhost:8787`, with the MCP endpoint at `http://localhost:8787/mcp`.

## Test the MCP server

Any MCP client speaking the streamable HTTP transport can connect to `/mcp`. The examples below use [`mcporter`](https://github.com/instructa/mcporter), a small MCP CLI (`npm i -g mcporter`). `--allow-http` is only needed for local plain-HTTP URLs.

```bash
# List the available tools and their schemas
mcporter list http://localhost:8787/mcp --schema --allow-http

# Create a contact
mcporter call "http://localhost:8787/mcp.create_contact" --allow-http \
  name="Ada Lovelace" email="ada@analytical.engine" company="Analytical Engines"

# Search contacts (omit query to list everyone)
mcporter call "http://localhost:8787/mcp.search_contacts" --allow-http query="engine"

# Update a contact (note key:value for numeric args)
mcporter call "http://localhost:8787/mcp.update_contact" --allow-http id:1 phone="+1-555-0100"

# Delete a contact
mcporter call "http://localhost:8787/mcp.delete_contact" --allow-http id:1
```

To add it to an MCP-aware client (Cursor, Claude Desktop, etc.), point the client at the `/mcp` URL as a streamable HTTP server. The quickest way is [`add-mcp`](https://www.npmjs.com/package/add-mcp), which writes the client config for you:

```bash
npx add-mcp http://localhost:8787/mcp -a cursor
```

Pass `-a <agent>` to target a specific client (e.g. `cursor`, `claude`); omit it to pick interactively. Swap in your deployed function URL once it's live.

## Deploy to Neon Functions

Deploy the MCP server as a Neon Function to your branch:

```bash
neon deploy
```

## Test your deployed function

Grab the function's invocation URL and connect your MCP client to its `/mcp` path:

```bash
# List the function to find its invocation URL
neon functions get contacts

# Then point an MCP client at it (replace with your URL)
mcporter list https://<your-branch>-contacts.compute.<region>.aws.neon.tech/mcp --schema
```

> A Neon Function has a **public HTTPS URL — it is reachable by anyone.** This example keeps things minimal and does not authenticate callers. Before exposing a real MCP server, verify a token/API key at the top of the handler (see the `neon-functions` skill in `.agents/skills`).
