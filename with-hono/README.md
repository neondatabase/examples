<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Hono

A minimal [Hono](https://hono.dev) API backed running [Neon](https://neon.com) Postgres and [Drizzle ORM](https://orm.drizzle.team) on Neon Functions.

## Project structure

```
with-hono/
├── neon.ts             # Neon Functions policy (defineConfig) — what gets deployed
├── drizzle.config.ts   # Drizzle Kit config (schema location + DB credentials)
├── tsconfig.json
├── .env.example        # Required environment variables
├── src/
│   ├── index.ts        # Hono app + routes + db client (the function entry)
│   └── db/
│       └── schema.ts   # Drizzle schema
└── package.json
```

## Clone the repository

```bash
npx degit neondatabase/examples/with-hono ./with-hono
cd with-hono
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

Then in another shell (use the port `neon dev` printed):

```bash
# Create a todo
curl -X POST http://localhost:8787/todos \
  -H 'content-type: application/json' \
  -d '{"text":"ship it"}'

# List todos
curl http://localhost:8787/todos
```

## Deploy to Neon Functions

Deploy hono app as a Neon Function to your branch

```bash
neon deploy
```

## Test your deployed function

Grab the function's invocation URL and call it:

```bash
# List the function to find its invocation URL
neon functions get todos

# Then call it (replace with your URL)
curl https://<your-branch>-todos.compute.<region>.aws.neon.tech/todos
```

`GET /todos` returns the rows as JSON; create one with:

```bash
curl -X POST https://<your-branch>-todos.compute.<region>.aws.neon.tech/todos \
  -H 'content-type: application/json' \
  -d '{"text":"ship it"}'
```
