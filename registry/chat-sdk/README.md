# Chat SDK bot for Slack, Telegram, and the web

This Neon Function runs a [Chat SDK](https://chat-sdk.dev) bot on [Slack](https://slack.com), [Telegram](https://telegram.org), and any `useChat` client, and every route uses the same few handlers. Replies stream from [Neon AI Gateway](https://neon.com/docs/ai-gateway/overview) through the AI SDK, so you don't need a model provider API key. Chat SDK keeps the bot's state in your Neon Postgres database, including thread subscriptions, locks, deduplication, queued messages, and the conversation history of platforms that have no history API.

<Operations>

| Route | Default | What it does |
| --- | --- | --- |
| `POST /slack` | yes | Receives Slack's Events API and interactivity requests. It answers @mentions and DMs, then keeps answering a thread it was mentioned in without another mention. Replies use Slack's native streaming, and Slack's stop button ends a reply. |
| `POST /web` | yes | Streams a reply in the AI SDK UI message format that `useChat` reads. Your backend sends a bearer token and an `X-User-Id` header, and the function reads earlier turns from Postgres. |
| `POST /telegram` | no | Receives Telegram's webhook. It answers every message in a private chat and, in groups, mentions of the bot or replies to it. It edits the reply in place as it streams. |

</Operations>

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new chat-sdk
```

The CLI asks which routes to include, and `--all-operations` includes `/telegram` too. It writes the modules and a router `index.ts` to `functions/chatsdk/` and declares the function in `neon.ts`.

The CLI declares the template's environment variables on the whole function, so `neon.ts` lists all five whichever routes you pick, and `neon deploy` fails while any of them is unset. In `neon.ts`, delete the keys for the routes you didn't scaffold from the function's `env`. Those are `SLACK_*` for `/slack`, `TELEGRAM_*` for `/telegram`, and `CHAT_WEB_TOKEN` for `/web`.

<EnvironmentVariables>

| Variable | Route | Description |
| --- | --- | --- |
| `SLACK_BOT_TOKEN` | `/slack` | The Bot User OAuth Token (`xoxb-...`) from your Slack app's OAuth & Permissions page. |
| `SLACK_SIGNING_SECRET` | `/slack` | The Signing Secret from your Slack app's Basic Information page, which verifies that requests come from Slack. |
| `TELEGRAM_BOT_TOKEN` | `/telegram` | The bot token from @BotFather. |
| `TELEGRAM_WEBHOOK_SECRET_TOKEN` | `/telegram` | A random secret of letters, digits, `_`, and `-`, for example from `openssl rand -hex 32`, that you also pass to `setWebhook` and that verifies requests come from Telegram. |
| `CHAT_WEB_TOKEN` | `/web` | A random token of at least 32 characters, for example from `openssl rand -hex 32`, that your backend sends as `Authorization: Bearer <token>`. Neon Function URLs are public, so `/web` requires it. |

</EnvironmentVariables>

Enable AI Gateway on the linked branch:

```bash
neon config add ai-gateway
```

You can also set `aiGateway: true` in `neon.ts`. AI Gateway requires prepaid credits and a project in a supported region. See the [AI Gateway quickstart](https://neon.com/docs/ai-gateway/get-started) and [prepaid credits](https://neon.com/docs/ai-gateway/prepaid-credits).

Set up the platforms you scaffolded as described below, then deploy. The first deploy provisions the gateway and pulls `DATABASE_URL`, `NEON_AI_GATEWAY_BASE_URL`, `NEON_AI_GATEWAY_TOKEN`, `NEON_BRANCH_ID`, and `NEON_FUNCTION_HOST_SUFFIX` into `.env.local`. `functionBaseUrl("chatsdk")` from `@neon/env` builds the function's URL from the last two:

```bash
neon deploy --env .env.local
```

Slack and Telegram send webhooks to a public URL, so point them at the deployed function. The examples below use `$URL` for the function URL.

## Slack

1. At [api.slack.com/apps](https://api.slack.com/apps), choose **Create New App** and then **From a manifest**, pick a workspace, and paste the manifest below. Leave the two `request_url` placeholders for now.
2. Choose **Install App** to install the app in the workspace. Copy the **Bot User OAuth Token** from **OAuth & Permissions** and the **Signing Secret** from **Basic Information** into `.env.local`:

   ```bash
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_SIGNING_SECRET=...
   ```

3. Run `neon deploy --env .env.local`.
4. On the app's **App Manifest** page, replace both `request_url` values with `$URL/slack` and save. Slack sends a verification request, which `/slack` answers.

```yaml
display_information:
  name: Neon Bot
  description: A Chat SDK bot on Neon Functions
features:
  agent_view:
    agent_description: A Chat SDK bot on Neon Functions
  bot_user:
    display_name: Neon Bot
    always_online: true
oauth_config:
  scopes:
    bot:
      - app_mentions:read
      - assistant:write
      - channels:history
      - channels:read
      - chat:write
      - groups:history
      - groups:read
      - im:history
      - im:read
      - mpim:history
      - mpim:read
      - reactions:read
      - reactions:write
      - users:read
settings:
  event_subscriptions:
    request_url: https://example.com/slack
    bot_events:
      - app_mention
      - message.channels
      - message.groups
      - message.im
      - message.mpim
      - member_joined_channel
      - app_home_opened
      - app_context_changed
      - agent_session_stopped
      - agent_session_title_changed
      - app_uninstalled
  interactivity:
    is_enabled: true
    request_url: https://example.com/slack
```

Invite the bot to a channel and mention it. It replies in a thread and subscribes to it, so the rest of the thread doesn't need a mention. Several people can talk to it in one thread. The bot puts each sender's name in front of their message, so the model can tell who said what. In the app's Messages tab, each message you send starts its own thread.

`/slack` acknowledges each event right away to stay inside Slack's 3-second deadline, and it generates the reply after the response. `waitUntil` from `@neon/functions` keeps the function running until the reply is done. Chat SDK deduplicates Slack's retries of the same event in Postgres.

## Web

Generate a token and add it to `.env.local`, then deploy:

```bash
echo "CHAT_WEB_TOKEN=$(openssl rand -hex 32)" >> .env.local
```

`/web` takes the body `useChat` sends (`id`, `messages`), the token as `Authorization: Bearer <token>`, and the signed-in user's id as `X-User-Id`. The conversation is the thread `web:<user id>:<chat id>`, so one user can't read another user's chat by guessing its id. The adapter reads only the newest user message from the body, and Chat SDK replays earlier turns from Postgres, so a client can't rewrite the history the model sees.

```bash
curl -N "$URL/web" \
  -H "Authorization: Bearer $CHAT_WEB_TOKEN" \
  -H "X-User-Id: user-ada" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "chat-1",
    "messages": [{ "id": "m1", "role": "user", "parts": [{ "type": "text", "text": "Hi, I am Ada and I love sailing." }] }]
  }'
```

Send another message with the same `id` and the bot remembers the first one.

Keep the token on your server and call `/web` from a backend route that knows who the user is. For example, in Next.js:

```ts
// app/api/chat/route.ts
import { functionBaseUrl } from "@neon/env";

export async function POST(request: Request) {
  const userId = await getSignedInUserId(request); // your auth
  if (!userId) return new Response("Unauthorized", { status: 401 });

  return fetch(`${functionBaseUrl("chatsdk")}/web`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CHAT_WEB_TOKEN}`,
      "Content-Type": "application/json",
      "X-User-Id": userId,
    },
    body: await request.text(),
    signal: request.signal,
  });
}
```

```tsx
import { useChat } from "@ai-sdk/react";

const { messages, sendMessage, stop } = useChat({ id: chatId }); // posts to /api/chat
```

`useChat`'s `stop()` aborts the request, which ends the generation. `/web` also answers CORS preflight requests from any origin, because the token grants access whatever the origin. User ids may not contain `:`, which Chat SDK uses as its thread id separator.

## Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`) and add its token and a webhook secret to `.env.local`, then deploy:

   ```bash
   TELEGRAM_BOT_TOKEN=123456:ABC...
   TELEGRAM_WEBHOOK_SECRET_TOKEN=<openssl rand -hex 32>
   ```

2. Register the webhook with the same secret:

   ```bash
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -H "Content-Type: application/json" \
     -d "{\"url\": \"$URL/telegram\", \"secret_token\": \"$TELEGRAM_WEBHOOK_SECRET_TOKEN\"}"
   ```

Telegram sends the secret in every request, and `/telegram` rejects requests without it. The adapter runs in webhook mode, because its default `auto` mode would start long polling on a host it doesn't recognize as serverless.

In a private chat, the bot answers every message. In a group, it answers when someone @mentions it or replies to one of its messages. It reads its username from the Bot API, so mentions need no configuration. Telegram's default privacy mode delivers replies to a bot but not plain @mentions. To use mentions, send `/setprivacy` to @BotFather, choose **Disable**, and then remove the bot from the group and add it again, or make the bot a group admin. Either way, the bot still answers only mentions and replies, but Telegram now delivers every group message, and Chat SDK keeps the newest ones in Postgres as context for the model.

## Where the data lives

Chat SDK's Postgres adapter keeps everything in five tables: `chat_state_subscriptions`, `chat_state_locks`, `chat_state_cache`, `chat_state_lists`, and `chat_state_queues`. Each module creates them on its first request, inside a transaction that holds an advisory lock, because concurrent `CREATE TABLE IF NOT EXISTS` statements fail on a fresh database.

Chat SDK reads Slack threads back from Slack's API. Telegram and web conversations have no history API, so Chat SDK stores their messages in `chat_state_lists`. It keeps the newest 100 messages of each conversation for 7 days after its last message. Each reply sends the model the new message and up to 20 earlier ones.

```sql
SELECT thread_id FROM chat_state_subscriptions;
```

## Errors

| Status | Meaning |
| --- | --- |
| `400` | `/web`: the body isn't a `useChat` request ending in a user message, or `X-User-Id` is missing, longer than 200 characters, or contains `:`. |
| `401` | `/slack`: the Slack signature is wrong. `/telegram`: the secret token is wrong. `/web`: the bearer token is wrong. |
| `404` | The route doesn't exist. The response body lists the valid routes. |
| `405` | The method is not `POST` (or `OPTIONS` on `/web`). |
| `502` | Postgres could not be reached to set up the tables. The function logs the cause. |
| `503` | The route's credentials are unset (`CHAT_WEB_TOKEN` also needs at least 32 characters), or `DATABASE_URL` or AI Gateway is missing. |

Slack and Telegram get `200` as soon as the function accepts an event. If generating the reply fails after that, the function logs the error and the bot posts nothing. On `/web`, a model error arrives as an `error` chunk in the stream, which `useChat` exposes as `error`.

## Notes

- **Model.** Every module sets `MODEL = "claude-haiku-5-5"`. You can use any text model from the [AI Gateway catalog](https://neon.com/docs/ai-gateway/models). `@neon/ai-sdk-provider` sends Claude models to the gateway's Anthropic Messages route, GPT models to Responses, and the rest to Chat Completions.
- **Overlapping messages.** `/slack` and `/telegram` use Chat SDK's `queue` strategy. A message that arrives while the bot is still replying in the same thread waits for that reply, and the bot then answers the newest waiting message with the others in its history. The default strategy would drop that message instead, as [Overlapping Messages](https://chat-sdk.dev/docs/concurrency) describes.
- **Customize.** Each module has its own `SYSTEM` prompt and handlers. Chat SDK also has [cards and buttons](https://chat-sdk.dev/docs/cards), [slash commands](https://chat-sdk.dev/docs/slash-commands), and [AI SDK tools](https://chat-sdk.dev/docs/ai/ai-sdk-tools) that let the model post, react, or DM people. To add another platform, such as Teams, Google Chat, or GitHub, add its [platform adapter](https://chat-sdk.dev/docs/platform-adapters) and a route. The modules can't import each other, so change the shared parts (`MODEL`, `HISTORY_LIMIT`) in each one.
- **Run locally.** `neon dev` serves the function with the branch's database and AI Gateway credentials. `/web` works against the local URL. Slack and Telegram need a public URL, so use the deployed function for them, or a tunnel.
