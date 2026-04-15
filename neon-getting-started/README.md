# Neon getting started (Next.js + Drizzle)

A small todo app that uses [Neon](https://neon.com) (Postgres), [Drizzle ORM](https://orm.drizzle.team), and [Next.js](https://nextjs.org) App Router with Server Actions.

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- A [Neon](https://console.neon.tech) project and database connection string

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure the database URL**

   Copy the example env file and add your Neon connection string:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set `DATABASE_URL` to the Postgres URL from the Neon dashboard (**Connect** → copy URI). Keep this file private; it is listed in `.gitignore`.

3. **Apply the schema**

   This repo includes SQL migrations under `drizzle/`. Apply them to your Neon database:

   ```bash
   npx drizzle-kit migrate
   ```

   For a quick local experiment you can instead push the schema directly (no migration files): `npx drizzle-kit push`. For anything you might ship, prefer migrations.

4. **Run the app**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Project layout

| Path | Purpose |
| --- | --- |
| `db/schema.ts` | Drizzle table definitions |
| `db/index.ts` | Neon serverless client + Drizzle instance |
| `drizzle/` | Generated migrations and Drizzle metadata |
| `drizzle.config.ts` | Drizzle Kit config |
| `app/actions.ts` | Server Actions for todos |

## Learn more

- [Neon docs](https://neon.com/docs)
- [Drizzle ORM — Neon](https://orm.drizzle.team/docs/get-started-postgresql#neon)
- [Next.js documentation](https://nextjs.org/docs)
