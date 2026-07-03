# Neon Discord Bot

A small Discord interactions bot hosted on Neon Functions.

It supports:

- Discord HTTP interaction verification with Ed25519 signatures
- `/ping` with estimated interaction latency
- `/info` with basic runtime and request information
- `/help` with a dynamic Components v2 help panel
- `/buttons` with clickable Components v2 button examples
- standard Discord embeds for non-Components v2 command responses
- `/name` backed by Neon Postgres via the Neon serverless driver
- `/profile` showing the stored name and command usage counts
- per-user command usage tracking in Neon Postgres
- optional ephemeral responses on every slash command

## Endpoint

Use this URL in the Discord Developer Portal as the Interactions Endpoint URL:

```text
https://br-crimson-rain-ajipxdp1-discord.compute.c-3.us-east-2.aws.neon.tech/api/interactions
```

The Neon function slug is `discord`. The `/api/interactions` path is handled by the same function and matches Discord’s common endpoint convention.

## Requirements

- Node.js 24 recommended
- pnpm 11
- Neon CLI authenticated and linked to the target Neon project
- A Discord application with a bot token

## Environment

Copy `.env.example` to `.env` and fill in:

```env
DISCORD_PUBLIC_KEY=
DISCORD_APPLICATION_ID=
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=

# Set automatically by Neon when running `pnpm deploy`.
NEON_BRANCH=
DATABASE_URL=
DATABASE_URL_UNPOOLED=
```

`DISCORD_PUBLIC_KEY` is required for the hosted interaction endpoint. It comes from Discord Developer Portal > Application > General Information > Public Key.

`DISCORD_APPLICATION_ID` and `DISCORD_BOT_TOKEN` are required to register slash commands. The deployed function also uses them to resolve command IDs for Discord slash-command mentions in `/help`.

`DISCORD_GUILD_ID` is optional. If set, commands are registered to one guild and update quickly. If omitted, commands are registered globally and may take longer to appear.

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

The `/name` command stores each Discord user's profile in Neon Postgres, and every slash command increments a per-user usage counter. The schema lives in `src/db/schema.ts`.

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

Each command accepts an optional `ephemeral` boolean. Set it to `true` to make the response visible only to the user who ran the command.

Discord API requests use this user agent:

```text
DiscordBot (https://neon.tech, Neon Functions Bot 1.0.0)
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

Append `/api/interactions` before pasting the URL into Discord.

## Local Development

```bash
pnpm dev
```

Neon serves the configured function from `neon.ts`.

## Project Structure

- `neon.ts` declares the Neon Function.
- `functions/discord.ts` is the HTTP interaction handler.
- `drizzle.config.ts` configures Drizzle Kit.
- `scripts/registerCommands.ts` registers Discord slash commands.
- `src/constants/` stores command names and Discord constants.
- `src/db/schema.ts` stores the Drizzle schema.
- `src/schemas/` stores Zod validation schemas.
- `src/types/` stores TypeScript types derived from schemas or shared across modules.
- `src/utils/` stores helper logic for Discord responses, signature verification, Components v2 panels, and Neon Postgres access.

## Commands

`/ping` returns an embed with `Pong` plus latency calculated from the Discord interaction snowflake.

`/info` renders a Components v2 panel with runtime details such as Node.js version, platform, function URL, request method, and Neon branch.

`/help` renders a dynamic Components v2 help panel from the registered command list. When the bot can resolve registered command IDs, commands are rendered with Discord slash-command mention syntax like `</profile:123>`.

`/buttons` renders a Components v2 button test panel with primary, secondary, success, and danger buttons. Each button updates the message with a different result.

`/name name:<your name>` stores your name in Neon Postgres and returns an embed. `/name` without a name reads back the stored value for your Discord user.

`/profile` renders a Components v2 panel with your stored name, total slash commands run, per-command usage counts, and storage details.

## Discord Message Formats

The bot intentionally uses two Discord response formats:

- Standard embeds for `/ping`, `/name`, and error messages.
- Components v2 for `/info`, `/help`, `/buttons`, and `/profile`, using Text Display, Container, Separator, Action Row, and Button components.

Discord requires Components v2 messages to set the `IS_COMPONENTS_V2` flag. When that flag is set, the response cannot include standard `content` or `embeds`, so Components v2 panels must be fully component-driven.

## Command Dispatch and Cold Starts

Slash commands are dispatched through a `name`-keyed command handler map in `functions/discord.ts`, so adding a command means adding one entry rather than another branch.

Command usage tracking is best-effort and runs without blocking the response, so a slow analytics write never delays a reply.

Discord fails an interaction that isn't answered within roughly three seconds. Because Neon scales to zero when idle, the first database query on a cold branch can be slow, so the database-backed `/name` and `/profile` commands fall back to a "warming up" reply if they exceed an internal deadline. Run the command again once the branch is warm.

Textbook Discord deferral (acknowledge now, send a follow-up later) is not used because it relies on post-response execution via `waitUntil`, which is currently a stub in the Neon Functions preview.
