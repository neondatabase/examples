<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://neon.com/brand/neon-logo-dark-color.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://neon.com/brand/neon-logo-light-color.svg">
  <img width="250px" alt="Neon Logo fallback" src="https://neon.com/brand/neon-logo-dark-color.svg">
</picture>

# Getting started with Neon and WhatsApp

A WhatsApp Cloud API webhook bot hosted on Neon Functions, backed by [Neon](https://neon.com) Postgres and [Drizzle ORM](https://orm.drizzle.team).

## Project structure

```
bots/whatsapp-bot-http/
├── neon.ts                 # Neon Functions policy (defineConfig)
├── drizzle.config.ts       # Drizzle Kit config (schema location + DB credentials)
├── functions/
│   └── whatsapp.ts         # WhatsApp webhook handler
├── src/
│   ├── constants/          # Command names and WhatsApp constants
│   ├── db/                 # Drizzle client and schema
│   ├── schemas/            # Zod validation schemas
│   ├── types/              # Shared TypeScript types
│   ├── utils/              # Graph API, response, callback, and DB helpers
│   └── env.ts              # Environment variable helpers
└── package.json
```

## What it does

The bot supports:

- WhatsApp webhook setup verification with Meta's `hub.challenge` flow
- incoming webhook signature validation with `X-Hub-Signature-256`
- best-effort read status updates for incoming messages
- `/ping` with estimated webhook latency
- `/info` with runtime and request information
- `/help` with a dynamic command list
- `/buttons` with interactive reply button examples
- `/name` backed by Neon Postgres via Drizzle and node-postgres
- `/profile` showing the stored name and command usage counts
- per-user command usage tracking in Neon Postgres

## Clone the repository

```bash
npx degit neondatabase/examples/bots/whatsapp-bot-http ./whatsapp-bot-http
cd whatsapp-bot-http
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

## Configure WhatsApp

Create a Meta app with WhatsApp Cloud API enabled, then copy `.env.example` to `.env` and fill in:

```env
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=

# Set automatically by Neon.
NEON_BRANCH=
DATABASE_URL=
DATABASE_URL_UNPOOLED=
```

`WHATSAPP_ACCESS_TOKEN` is the token used to call the Graph API.

`WHATSAPP_PHONE_NUMBER_ID` is the WhatsApp phone number ID from the Meta app dashboard.

`WHATSAPP_VERIFY_TOKEN` can be any strong random string. Meta sends it during webhook setup, and the function uses it to answer Meta's verification challenge.

`WHATSAPP_APP_SECRET` is the Meta app secret used to verify incoming `X-Hub-Signature-256` webhook signatures.

## Apply the schema

The `/name` command stores each WhatsApp user's profile in Neon Postgres, and every bot command increments a per-user usage counter.

```bash
npm run db:push
```

## Run locally

```bash
neon dev
```

Neon serves the configured function from `neon.ts`. To receive real WhatsApp webhooks locally, expose the local function URL with a tunnel and use the tunnel URL with `/api/webhook` appended in Meta's webhook settings.

## Deploy to Neon Functions

Deploy the WhatsApp webhook function with your WhatsApp secrets:

```bash
neon deploy --env .env
```

## Register the WhatsApp webhook

Grab the function invocation URL:

```bash
neon functions get whatsapp
```

Append `/api/webhook`, then configure that URL in the Meta app dashboard as the WhatsApp webhook callback URL. Use the same `WHATSAPP_VERIFY_TOKEN` value as the webhook verify token, and subscribe to the `messages` webhook field.

## Commands

`/ping` returns `Pong` plus latency calculated from the WhatsApp message timestamp.

`/info` renders a runtime details panel with Node.js version, platform, function URL, request method, and Neon branch.

`/help` renders a dynamic help panel from the command list.

`/buttons` sends a WhatsApp interactive message with refresh, echo, and time reply buttons. Each button sends a reply message with a different result.

`/name <your name>` stores your name in Neon Postgres. `/name` without a name reads back the stored value for your WhatsApp user.

`/profile` renders your stored name, total bot commands run, per-command usage counts, and storage details.

## WhatsApp Message Formats

The bot intentionally uses two WhatsApp response formats:

- Text messages for `/ping`, `/info`, `/help`, `/name`, `/profile`, and errors.
- Interactive reply buttons for `/buttons`, using button reply webhook events.

Responses are sent as replies to the triggering WhatsApp message when WhatsApp includes a message ID in the webhook event.

## Command Dispatch and Cold Starts

Bot commands are dispatched through a `name`-keyed command handler map in `functions/whatsapp.ts`, so adding a command means adding one entry rather than another branch.

Command usage tracking is best-effort and runs without blocking the response, so a slow analytics write never delays a reply.

Read status updates are best-effort too, so a failed status update does not block command handling.

Because Neon scales to zero when idle, the first database query on a cold branch can be slow. The database-backed `/name` and `/profile` commands fall back to a "warming up" reply if they exceed an internal deadline. Run the command again once the branch is warm.
