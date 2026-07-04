# Neon Telegram Bot

A small Telegram webhook bot hosted on Neon Functions.

It supports:

- Telegram webhook verification with `X-Telegram-Bot-Api-Secret-Token`
- `/ping` with estimated webhook latency
- `/info` with basic runtime and request information
- `/help` with a dynamic command list
- `/buttons` with clickable inline keyboard examples
- `/name` backed by Neon Postgres via Drizzle and node-postgres
- `/profile` showing the stored name and command usage counts
- per-user command usage tracking in Neon Postgres

## Endpoint

Use this URL as the Telegram webhook URL:

```text
https://<branch-id>-telegram.compute.c-3.us-east-2.aws.neon.tech/api/webhook
```

The Neon function slug is `telegram`. The `/api/webhook` path is handled by the same function and matches the webhook path configured in this example.

## Requirements

- Node.js 24 recommended
- pnpm 11
- Neon CLI authenticated and linked to the target Neon project
- A Telegram bot token from [BotFather](https://t.me/BotFather)

## Environment

Copy `.env.example` to `.env` and fill in:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_WEBHOOK_URL=

# Set automatically by Neon when running `pnpm deploy`.
NEON_BRANCH=
DATABASE_URL=
DATABASE_URL_UNPOOLED=
```

`TELEGRAM_BOT_TOKEN` is required for the webhook handler and setup scripts.

`TELEGRAM_WEBHOOK_SECRET` is sent to Telegram when you run `pnpm set:webhook`. Telegram includes it in the `X-Telegram-Bot-Api-Secret-Token` header on every webhook update, and the function rejects requests that do not match.

`TELEGRAM_WEBHOOK_URL` is only used by `pnpm set:webhook`. Set it to the deployed function URL with `/api/webhook` appended.

`NEON_BRANCH`, `DATABASE_URL`, and `DATABASE_URL_UNPOOLED` are written by Neon during `pnpm deploy`. They are shown in `.env.example` for completeness; you normally do not need to fill them in by hand. The `/name` and `/profile` commands use `DATABASE_URL` to query Drizzle-managed tables.

## Install

```bash
pnpm install
```

## Check

```bash
pnpm check
```

## Database

The `/name` command stores each Telegram user's profile in Neon Postgres, and every bot command increments a per-user usage counter. The schema lives in `src/db/schema.ts`.

```bash
pnpm db:push
```

This applies the `profiles` and `command_usage` tables to the database configured by `DATABASE_URL`.

## Register Commands

```bash
pnpm register:commands
```

This registers:

- `/ping`
- `/info`
- `/help`
- `/buttons`
- `/name`
- `/profile`

Telegram Bot API requests use this user agent:

```text
TelegramBot (https://neon.tech, Neon Functions Bot 1.0.0)
```

## Deploy

```bash
pnpm deploy
```

This deploys the Neon Function and writes Neon-managed env vars such as `NEON_BRANCH`, `DATABASE_URL`, and `DATABASE_URL_UNPOOLED` into `.env`.

Get the current hosted function URL:

```bash
pnpm endpoint
```

Append `/api/webhook`, set `TELEGRAM_WEBHOOK_URL` in `.env`, then register the webhook with Telegram:

```bash
pnpm set:webhook
```

## Local Development

```bash
pnpm dev
```

Neon serves the configured function from `neon.ts`. To receive real Telegram webhooks locally, expose the local function URL with a tunnel and set `TELEGRAM_WEBHOOK_URL` to the tunnel URL with `/api/webhook` appended.

## Project Structure

- `neon.ts` declares the Neon Function.
- `functions/telegram.ts` is the HTTP webhook handler.
- `drizzle.config.ts` configures Drizzle Kit.
- `scripts/registerCommands.ts` registers Telegram bot commands.
- `scripts/setWebhook.ts` registers the Telegram webhook URL and secret.
- `src/constants/` stores command names and Telegram constants.
- `src/db/schema.ts` stores the Drizzle schema.
- `src/env.ts` reads Neon-managed and Telegram-specific environment variables.
- `src/schemas/` stores Zod validation schemas.
- `src/types/` stores TypeScript types derived from schemas or shared across modules.
- `src/utils/` stores helper logic for Telegram responses, Bot API calls, inline keyboards, webhook verification, and Neon Postgres access.

## Commands

`/ping` returns `Pong` plus latency calculated from the Telegram message timestamp.

`/info` renders a runtime details panel with Node.js version, platform, function URL, request method, and Neon branch.

`/help` renders a dynamic help panel from the command list used by `pnpm register:commands`.

`/buttons` renders a Telegram inline keyboard with refresh, echo, time, and confirm callback examples. Each button edits the message with a different result.

`/name <your name>` stores your name in Neon Postgres. `/name` without a name reads back the stored value for your Telegram user.

`/profile` renders your stored name, total bot commands run, per-command usage counts, and storage details.

## Telegram Message Formats

The bot intentionally uses two Telegram response formats:

- HTML-formatted text messages for `/ping`, `/info`, `/help`, `/name`, `/profile`, and errors.
- Inline keyboards for `/buttons`, using callback queries that edit the original message.

## Command Dispatch and Cold Starts

Bot commands are dispatched through a `name`-keyed command handler map in `functions/telegram.ts`, so adding a command means adding one entry rather than another branch.

Command usage tracking is best-effort and runs without blocking the response, so a slow analytics write never delays a reply.

Because Neon scales to zero when idle, the first database query on a cold branch can be slow. The database-backed `/name` and `/profile` commands fall back to a "warming up" reply if they exceed an internal deadline. Run the command again once the branch is warm.
