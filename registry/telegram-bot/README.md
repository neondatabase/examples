# Telegram AI chat bot

A minimal Telegram webhook bot on Neon Functions. It verifies Telegram's secret token, sends each text message to a model through [Neon AI Gateway](https://neon.com/docs/ai-gateway/overview), and replies with the answer. The conversation is stored in Postgres; the last 10 messages in a chat are replayed to the model as context.

## Create the bot

1. Open [@BotFather](https://t.me/BotFather), send `/newbot`, and copy the token.
2. Generate a webhook secret. It may contain only letters, digits, `_` and `-`:

```bash
openssl rand -hex 32
```

## Scaffold and configure

```bash
npm i -g neon@latest
neon login
neon link

neon functions new telegram-bot
```

Add both values to `.env.local` without replacing the Neon values already there:

```bash
echo 'TELEGRAM_BOT_TOKEN=<bot token>' >> .env.local
echo 'TELEGRAM_WEBHOOK_SECRET=<secret from above>' >> .env.local
```

Enable AI Gateway on the branch:

```bash
neon config add ai-gateway
```

Or set `aiGateway: true` in `neon.ts`. AI Gateway requires a paid Neon plan with prepaid credits and a project in a supported region. See [AI Gateway get started](https://neon.com/docs/ai-gateway/get-started).

`neon link` writes `DATABASE_URL` to `.env.local`. When you open the function URL in a browser or send it a `GET` request, the function creates the `telegram_messages` table and its index, then registers the webhook with Telegram so the bot can receive messages. If Telegram rejects the request, for example because the bot token is wrong, the function returns `502` with Telegram's error message. The function URL is printed by `neon deploy`.

## Deploy

```bash
neon deploy --env .env.local
neon functions get telegrambot
```

## Try it

Open the bot in Telegram, send `/start`, then send any text. Follow up with another message to see it use the earlier turns. The model receives the last 10 messages from the same Telegram chat.
