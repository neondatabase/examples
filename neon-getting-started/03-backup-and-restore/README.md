# Neon getting started — Backup &amp; Restore (Next.js + Drizzle)

A small todo app that uses [Neon](https://neon.com) (Postgres), [Drizzle ORM](https://orm.drizzle.team), and [Next.js](https://nextjs.org) App Router with Server Actions.

This example builds on `02-neon-branches` by adding a separate `categories` table that you can assign to each todo. The schema is deliberately set up so that **if the `categories` table is dropped, the rest of the app keeps working** — which is useful for practicing backup &amp; recovery drills with Neon branches.

## What's different from `02-neon-branches`

- A new `categories` table with five seeded categories (Work, Personal, Shopping, Health, Learning).
- A new `category_id` column on `todos` (nullable `uuid`).
- A `CategoryPicker` component in the add-todo form.
- Each todo shows a colored dot and the category name beside its due date.

## How the schema survives losing the categories table

The schema avoids any hard dependency between the two tables:

- `todos.category_id` is a plain `uuid` column — **not** a foreign key. Dropping `categories` (or any single row in it) will never fail because of `todos`, and won't cascade-delete or null-out any todos.
- The app loads categories defensively in `app/page.tsx`; if the `categories` table is missing, the query is caught and the UI falls back to "no categories available" without crashing.
- When `todos.category_id` points to a category that no longer exists (a dangling UUID), the todo simply renders without a category label.

This makes it safe to practice scenarios like:

1. Take a Neon branch from production.
2. `DROP TABLE categories;` on the branch.
3. Confirm the app keeps serving todos against that branch.
4. Restore the categories table from a backup branch or from the migrations and verify todos pick their labels back up.

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

   Migration `0002_curious_paladin` creates the `categories` table, seeds the five categories, and adds the `category_id` column to `todos`.

4. **Run the app**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Try the recovery drill

```sql
-- Simulate losing the categories table on a Neon branch
DROP TABLE categories;
```

Reload the app — todos still load, the category picker disappears, and any existing `category_id` values stay intact on the `todos` rows. Re-run `npx drizzle-kit migrate` (or restore from a Neon branch) to bring categories back; previously-tagged todos will display their labels again.

## Project layout

| Path | Purpose |
| --- | --- |
| `db/schema.ts` | Drizzle table definitions (`todos`, `categories`) |
| `db/index.ts` | Neon serverless client + Drizzle instance |
| `drizzle/` | Generated migrations and Drizzle metadata |
| `drizzle.config.ts` | Drizzle Kit config |
| `app/actions.ts` | Server Actions for todos |
| `app/category-picker.tsx` | Client component for choosing a category |

## Learn more

- [Neon docs](https://neon.com/docs)
- [Neon branching for backups](https://neon.com/docs/guides/branching-pitr)
- [Drizzle ORM — Neon](https://orm.drizzle.team/docs/get-started-postgresql#neon)
- [Next.js documentation](https://nextjs.org/docs)
