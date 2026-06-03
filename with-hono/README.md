<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Hono

A minimal [Hono](https://hono.dev) API backed by [Neon](https://neon.com) Postgres and [Drizzle ORM](https://orm.drizzle.team).

## Project structure

```
with-hono/
├── drizzle.config.ts
├── src/
│   ├── index.ts        # Hono app + routes + db client
│   └── db/
│       └── schema.ts   # Drizzle schema
└── package.json
```

## Clone the repository

```bash
npx degit neondatabase/examples/with-hono ./with-hono
cd with-hono
```

## Configure your environment

Copy the example env file and fill in your Neon connection string:

```bash
cp .env.example .env
```

```
DATABASE_URL="postgresql://neondb_owner:...@ep-...us-east-1.aws.neon.tech/neondb?sslmode=require"
```

You can find your connection string in the [Neon Console](https://console.neon.tech).

## Install dependencies

```bash
npm install
```

## Apply the schema

Push the Drizzle schema to your Neon database:

```bash
npm run db:push
```