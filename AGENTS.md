# Agent guide

Example applications and starter templates for Neon. Each subdirectory is a self-contained app.

`bootstrap.yaml` is the catalog `neon bootstrap` copies from. Those templates must not vendor agent skills.

Contributor and agent rules live in [CONTRIBUTING.md](./CONTRIBUTING.md). Read that before adding or editing an example.

## Env files

Templates in `bootstrap.yaml` use `.env.local` as the env file, not `.env`.

`neon env pull` (also the pull inside `neon link` / `neon checkout`) writes `.env` if that file exists, otherwise `.env.local`. `neon bootstrap` copies `.env.example` only, so the pull creates `.env.local`. Same convention as Next.js and `vercel env pull`.

After a pull, add extra keys to that file. Do not `cp .env.example .env.local`; that overwrites `DATABASE_URL`. If `drizzle.config.ts` imports `neon.ts` and `neon.ts` reads Function env at load, preload `.env.local` before that import (`load-env.ts` in the bot templates): ESM hoists imports, and drizzle-kit auto-loads `.env` only.
