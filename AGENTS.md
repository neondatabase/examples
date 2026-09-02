# Agent guide

Example applications and starter templates for Neon. Each subdirectory is a self-contained app.

`bootstrap.yaml` is the catalog `neon bootstrap` copies from. Those templates must not vendor agent skills.

Contributor and agent rules live in [CONTRIBUTING.md](./CONTRIBUTING.md). Read that before adding or editing an example.

## Env files

Templates in `bootstrap.yaml` use `.env.local` as the env file, not `.env`.

`neon env pull` (also the pull inside `neon link` / `neon checkout`) writes `.env` if that file exists, otherwise `.env.local`. `neon bootstrap` copies `.env.example` only, so the pull creates `.env.local`. Same convention as Next.js and `vercel env pull`.

After a pull, add extra keys to that file. Do not `cp .env.example .env.local`; that overwrites `DATABASE_URL`. If `drizzle.config.ts` imports `neon.ts` and `neon.ts` reads Function env at load, preload `.env.local` before that import (`load-env.ts` in the bot templates): ESM hoists imports, and drizzle-kit auto-loads `.env` only.

## Smoke tests

A change to a template in `bootstrap.yaml` is not done until that template has been run end to end against a real Neon project.

### Auth

`neon me` must succeed. If it does not, stop and ask the developer to authenticate the Neon CLI (`neon login`) or to provide an API key. Do not guess an account, org, or project.

If `neon link` needs an org or project and cannot prompt, ask which org to use and whether to create a throwaway project or reuse one.

### Flow

Use a throwaway directory outside this repository. Pass `--no-link` so `neon link` is a real step, and skip git / agent setup so the smoke is the app flow:

```bash
neon bootstrap ./smoke-<id> --template <id> --no-link --no-git --no-agent-setup
cd ./smoke-<id>
```

`neon bootstrap` copies from the GitHub `source` in `bootstrap.yaml` (usually `main`). If the edit is not on that ref yet, copy the local template subdirectory over the scaffolded files.

Then, in the scaffolded directory:

1. `neon link`
2. `neon env pull`. Vars must land in `.env.local` when `.env` is absent.
3. Add any extra keys the README requires to `.env.local`. Ask the developer for third-party secrets (Discord, Telegram, and so on). If they cannot provide them, go as far as Neon env allows and say what you could not deploy.
4. `neon dev`. Exercise a documented request, then stop.
5. `neon deploy`, or the template's deploy script (`neon deploy --env .env.local`)

Read the full command output. A warning, a missing env file, a prompt that should not appear, a step that only works after copying `.env.example` to `.env`, or a failed command is a finding. Fix it in the template or report it.

### Cleanup

Delete the throwaway directory. If you created a Neon project for the run, delete it unless the developer asked to keep it.
