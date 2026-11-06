# How to contribute

Howdy! Usual good software engineering practices apply. Write tests. Write comments. Use `npm run fmt` to tidy up formatting.

1. Make sure to have concise project name (in relevant directories).
2. Make sure to have package.json follow a with-{technology}-{usecase}-{framework}-{deployment-platform} naming convention. `technology`, `usecase` and `deployment-platform` are optional, and should be used to represent a specific integration example.
3. Always have an example environment variables (if required to run the example) with comments. Following is a sample:

```bash
# Postgres Connection String retrieved here: https://console.neon.tech
DATABASE_URL="postgresql://user:password@ep-xxx-xxx-pooler.region.neon.tech/neondb?sslmode=require&channel_binding=require"
# OpenAI API Key retrieved here: https://platform.openai.com/api-keys
OPENAI_API_KEY="sk-..."
```

There are soft spots in the code, which could use cleanup, refactoring, additional comments, and so forth. Let's try to raise the bar, and clean things up as we go. Try to leave code in a better shape than it was before.

## Agent skills and plugins

Do not commit Neon agent skills, `skills-lock.json`, `.agents/`, or `.claude/skills/` in an example. `neon bootstrap` copies the template as-is, and `neon init` / `neon bootstrap` install the Neon plugin or skills and MCP into the user's project. Vendoring them here would install them twice.

Install tooling in a checkout with:

```bash
npx neon init
```

That offers the Neon plugin, or skills and MCP separately. Templates listed in `bootstrap.yaml` are what `neon bootstrap` copies, so they must stay free of vendored skills.

Keep per-example `AGENTS.md` when it is project instructions (branch workflow, which Neon project to use). That is not a skill.

## Env files

Templates listed in `bootstrap.yaml` use `.env.local` as the env file, not `.env`.

`neon env pull` (and the pull bundled into `neon link` / `neon checkout`) writes `.env` if that file already exists, otherwise `.env.local`. After `neon bootstrap` there is no `.env`, only `.env.example`, so the pull creates `.env.local`. That is the Next.js / `vercel env pull` convention.

- Commit `.env.example`. Gitignore `.env` and `.env.local`.
- Point drizzle `loadEnv`, `neon deploy --env`, and `node --env-file` at `.env.local`.
- After a pull, add extra keys to the existing `.env.local`. Do not `cp .env.example .env.local`; that overwrites `DATABASE_URL`.
- If `drizzle.config.ts` imports `neon.ts`, and `neon.ts` reads Function env at module load, preload `.env.local` before that import. ESM hoists imports, and drizzle-kit auto-loads `.env` only. The bot templates do this with `load-env.ts`.

## Submitting changes

1. Get at least one +1 on your PR before you push. For simple patches, it will only take a minute for someone to review it.

2. Don't force push small changes after making the PR ready for review. Doing so will force readers to re-read your entire PR, which will delay the review process.

*Happy Hacking!*