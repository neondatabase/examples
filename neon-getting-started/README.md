# Neon Getting Started

A video tutorial series that builds a small todo app with [Neon](https://neon.com), [Drizzle ORM](https://orm.drizzle.team), and [Next.js](https://nextjs.org) App Router.

Each phase of the series lives in its own self-contained subdirectory so you can `cd` into the one that matches the video you are watching and run it independently.

## Phases

| Video | Folder | What it covers |
| --- | --- | --- |
| [Getting Started with Neon](https://www.youtube.com/watch?v=XtMiMnX0hDg) | [`01-getting-started/`](./01-getting-started) | Initial Next.js todo app with Neon, Drizzle, and migrations |
| Getting Started with Database Branching | [`02-neon-branches/`](./02-neon-branches) | Working with Neon branches while adding todo due dates |

## Run a phase

Each folder is a complete Next.js project. From the repo root:

```bash
cd 01-getting-started      # or 02-neon-branches
npm install
cp .env.example .env       # then set DATABASE_URL to your Neon connection string
npx drizzle-kit migrate
npm run dev
```

Open <http://localhost:3000>.

## Compare phases

To see exactly what changes between two videos, diff the folders:

```bash
diff -ru 01-getting-started 02-neon-branches
```
