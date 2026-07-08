<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and Telegram

A Telegram webhook bot hosted on Neon Functions, backed by [Neon](https://neon.com) Postgres and [Drizzle ORM](https://orm.drizzle.team).

## Project structure

```
bots/telegram-bot-http/
├── neon.ts                  # Neon Functions policy (defineConfig)
├── drizzle.config.ts        # Drizzle Kit config (schema location + DB credentials)
├── functions/
│   └── telegram.ts          # Telegram webhook handler
├── scripts/
│   ├── registerCommands.ts  # Registers Telegram bot commands
│   └── setWebhook.ts        # Registers the Telegram webhook URL and secret
├── src/
│   ├── constants/           # Command names and Telegram constants
│   ├── db/                  # Drizzle client and schema
│   ├── schemas/             # Zod validation schemas
│   ├── types/               # Shared TypeScript types
│   ├── utils/               # Bot API, response, callback, and DB helpers
│   └── env.ts               # Environment variable helpers
└── package.json
```

## What it does

The bot supports:

- Telegram webhook verification with `X-Telegram-Bot-Api-Secret-Token`
- `/ping` with estimated webhook latency
- `/info` with runtime and request information
- `/help` with a dynamic command list
- `/buttons` with inline keyboard callback examples
- `/name` backed by Neon Postgres via Drizzle and node-postgres
- `/profile` showing the stored name and command usage counts
- per-user command usage tracking in Neon Postgres

## Clone the repository

```bash
npx degit neondatabase/examples/bots/telegram-bot-http ./telegram-bot-http
cd telegram-bot-http
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

## Configure Telegram

Create a bot with [BotFather](https://t.me/BotFather), then copy `.env.example` to `.env` and fill in:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_WEBHOOK_URL=

# Set automatically by Neon.
NEON_BRANCH=
DATABASE_URL=
DATABASE_URL_UNPOOLED=
```

`TELEGRAM_BOT_TOKEN` is required for the webhook handler and setup scripts.

`TELEGRAM_WEBHOOK_SECRET` can be any strong random string. Telegram includes it in the `X-Telegram-Bot-Api-Secret-Token` header on every webhook update, and the function rejects requests that do not match.

`TELEGRAM_WEBHOOK_URL` is only used by `npm run set:webhook`. After deployment, set it to the function invocation URL with `/api/webhook` appended.

## Apply the schema

The `/name` command stores each Telegram user's profile in Neon Postgres, and every bot command increments a per-user usage counter.

```bash
npm run db:push
```

## Run locally

```bash
neon dev
```

Neon serves the configured function from `neon.ts`. To receive real Telegram webhooks locally, expose the local function URL with a tunnel and set `TELEGRAM_WEBHOOK_URL` to the tunnel URL with `/api/webhook` appended.

## Deploy to Neon Functions

Deploy the Telegram webhook function with your Telegram secrets:

```bash
neon deploy --env .env
```

## Register the Telegram bot

Register the bot commands:

```bash
npm run register:commands
```

Grab the function invocation URL:

```bash
neon functions get telegram
```

Append `/api/webhook`, set `TELEGRAM_WEBHOOK_URL` in `.env`, then register the webhook with Telegram:

```bash
npm run set:webhook
```

## Commands

`/ping` returns `Pong` plus latency calculated from the Telegram message timestamp.

`/info` renders a runtime details panel with Node.js version, platform, function URL, request method, and Neon branch.

`/help` renders a dynamic help panel from the command list used by `npm run register:commands`.

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
