# How to contribute

Howdy! Usual good software engineering practices apply. Format with `npx prettier --write <example>`, which reads `.prettierrc.json` at the repo root. Templates listed in `bootstrap.yaml` also follow [Starter code](#starter-code).

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

## Starter code

Templates in `bootstrap.yaml` are often the first Neon code someone reads, so each one should read top to bottom in one pass: imports, the database connection, the routes, `export default`.

Connect to Postgres at the top of `src/index.ts`, as the `neon-functions` skill shows:

```ts
const { postgres } = parseEnv(config, ['DATABASE_URL']);
const pool = new Pool({ connectionString: postgres.databaseUrl, max: 5 });
attachDatabasePool(pool);
const db = drizzle(pool);
```

- Don't wrap this in `getDb()` or `getDatabaseUrl()` helpers or lazy caches. When another file needs `db`, pass it in (the tRPC context) or move these four lines to `src/db.ts`.
- Declare a Function secret in `neon.ts` with `required: true` and read it with `parseEnv(config, '<slug>').function`. `parseEnv` then returns a `string`, so don't check it again.
- Validate only the input the template is about. When a handler validates a JSON body, parse it in one `try/catch`, check the fields it needs, and return 400 with a message that names the expected shape.
- Name values after the domain (`todo`, `counter`, `image`), not `row` or `result`.
- Comment only a constraint the code can't show, such as why state is per isolate or why an import has to come first. Don't narrate the next line or restate a name.
- The `/` route returns one line of text that names the routes.
- Use single quotes, and no `.js` extension on local imports when `tsconfig.json` uses `"moduleResolution": "bundler"`. Prettier handles quotes and line length.
- Don't cast with `as`. Narrow instead, as in `error instanceof Error ? error.message : String(error)`.
- Return a stream with `c.body(stream, 200, headers)`, not `new Response(stream)`, so middleware such as `cors()` still sets its headers.
- When an error can carry the request body, log its message, not the error object. Stripe's signature error includes the webhook payload, customer email included.

### Simplifying a template

Shorter code is the goal only while behavior stays the same. Keep every route, status code, and response field, and keep compatibility paths: `with-stripe-webhooks` reads `current_period_end` from the subscription as well as the item, because endpoints on Stripe API versions before 2025-03-31 send it there. Keep an error response a caller reads, such as the JSON 500 a webhook returns. Before you delete code that looks unnecessary, find out why it's there, and if it has to stay, say why in a comment.

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
